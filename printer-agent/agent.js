import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOrder, DEFAULT_LAYOUT } from './formatter.js';
import { printEscPos } from './escpos.js';
import { listWindowsPrinters, printWindowsRaw } from './windows-printer.js';

// Agente de impressao do AtendePrint.
//
// Ele NAO tem tela: roda escondido no computador do restaurante e a unica
// interface e o painel web. O ciclo e simples:
//   1. descobre as impressoras instaladas neste PC (USB/rede);
//   2. informa ao painel quais existem agora e como o agente esta;
//   3. recebe do painel a configuracao (largura, altura, layout, impressora);
//   4. busca a fila de pedidos, imprime e avisa o painel do resultado.
//
// Nada aqui abre janela, e o dominio do painel fica somente neste arquivo.

const AGENT_VERSION = '3.0.0';

const directory = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = process.pkg ? path.dirname(process.execPath) : directory;
// Rodando pelo Node o config.json pode estar na pasta do agente ou em dist/ (ao lado do executavel).
const configCandidates = process.pkg
  ? [path.join(runtimeDirectory, 'config.json')]
  : [path.join(runtimeDirectory, 'config.json'), path.join(runtimeDirectory, 'dist', 'config.json')];
let savedConfig = {};
let configError = '';
let loadedConfigPath = '';
for (const candidate of configCandidates) {
  try {
    // Um BOM no começo do arquivo quebraria o JSON.parse, então removemos antes de ler.
    savedConfig = JSON.parse((await fs.readFile(candidate, 'utf8')).replace(/^\uFEFF/, ''));
    loadedConfigPath = candidate;
    break;
  } catch (error) {
    configError = error.code === 'ENOENT' ? 'config.json nao encontrado' : `config.json invalido (${error.message})`;
  }
}
const apiUrl = (process.env.ATENDEAI_API_URL || savedConfig.apiUrl || 'http://localhost:3000').replace(/\/$/, '');
const outputDirectory = path.join(runtimeDirectory, 'output');

// Sem tela, o log do console e a unica forma de saber o que o agente fez. Ele passa a ser
// gravado em agent.log (ao lado do executavel) e rotacionado em 1 MB, para nao crescer sem fim.
// A gravacao e sincrona para que o arquivo nunca perca a ultima linha, nem quando o processo
// termina logo depois (--list-printers, --test, segundo agente abrindo).
const logFile = path.join(runtimeDirectory, 'agent.log');
const logBuffer = [];

function flushLog() {
  if (!logBuffer.length) return;
  const chunk = `${logBuffer.join('\n')}\n`;
  logBuffer.length = 0;
  try {
    if (fsSync.statSync(logFile, { throwIfNoEntry: false })?.size > 1024 * 1024) {
      fsSync.rmSync(`${logFile}.old`, { force: true });
      fsSync.renameSync(logFile, `${logFile}.old`);
    }
    fsSync.appendFileSync(logFile, chunk, 'utf8');
  } catch {
    // Se nao der para gravar (pasta sem permissao), seguir imprimindo e o que importa.
  }
}

function appendToLog(level, args) {
  const text = args
    .map((value) => (typeof value === 'string' ? value : value instanceof Error ? value.message : JSON.stringify(value)))
    .join(' ');
  logBuffer.push(`${new Date().toISOString()} [${level}] ${text}`);
}

for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    appendToLog(level, args);
  };
}

process.on('exit', flushLog);
setInterval(flushLog, 1000).unref();
// Nome da maquina: o painel usa para diferenciar dois computadores do mesmo restaurante.
const machineName = savedConfig.machineName || process.env.ATENDEAI_MACHINE || os.hostname();
let lastPollError = '';
let lastConfigError = '';
let pollCount = 1;

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

// Dois agentes na mesma maquina disputam a mesma fila e um pedido pode ficar preso em "printing".
// O arquivo de trava guarda o PID de quem esta rodando; se o processo morreu, a trava e ignorada.
const lockFile = path.join(runtimeDirectory, '.agent.lock');

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function acquireSingleInstanceLock({ quiet = true } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') return true;
      const previous = Number((await fs.readFile(lockFile, 'utf8').catch(() => '')).trim());
      if (previous && previous !== process.pid && processIsAlive(previous)) {
        // Rodando como servico isso nao e problema: ja existe um agente trabalhando.
        if (!quiet) console.warn(`[aviso] Ja existe um agente rodando (PID ${previous}). Encerrando este para nao imprimir em duplicidade.`);
        return false;
      }
      await fs.rm(lockFile, { force: true });
    }
  }
  return true;
}

async function releaseSingleInstanceLock() {
  const owner = Number((await fs.readFile(lockFile, 'utf8').catch(() => '')).trim());
  if (owner === process.pid) await fs.rm(lockFile, { force: true });
}

// Precedência: variável de ambiente > config.json local > configuração salva no painel.
// O que está definido localmente nunca é sobrescrito pela configuração da plataforma,
// porque o hardware (nome da impressora, IP, largura do papel) é específico deste PC.
const localOverrides = {
  mode: firstValue(process.env.ATENDEAI_PRINT_MODE, savedConfig.mode),
  printerHost: firstValue(process.env.PRINTER_HOST, savedConfig.printerHost),
  printerPort: firstValue(process.env.PRINTER_PORT, savedConfig.printerPort),
  printerName: firstValue(process.env.PRINTER_NAME, savedConfig.printerName),
  columns: firstValue(process.env.PRINTER_COLUMNS, savedConfig.columns),
  maxLines: firstValue(process.env.PRINTER_MAX_LINES, savedConfig.maxLines),
  pollMs: firstValue(process.env.ATENDEAI_POLL_MS, savedConfig.pollSeconds ? savedConfig.pollSeconds * 1000 : undefined),
};

const settings = {
  mode: localOverrides.mode || 'virtual',
  printerHost: localOverrides.printerHost || '',
  printerPort: localOverrides.printerPort || '9100',
  printerName: localOverrides.printerName || '',
  // Largura do cupom em colunas e altura maxima (0 = tamanho do pedido).
  columns: Number(localOverrides.columns || 42),
  maxLines: Number(localOverrides.maxLines || 0),
  layout: typeof savedConfig.layout === 'string' && savedConfig.layout.trim() ? savedConfig.layout : DEFAULT_LAYOUT,
  pollMs: Number(localOverrides.pollMs || 5000),
};

function describeSettings() {
  console.log(`[config] modo=${settings.mode} | largura=${settings.columns} colunas | altura=${settings.maxLines || 'automatica'} | busca=${settings.pollMs / 1000}s`);
  if (settings.mode === 'usb') console.log(`[config] impressora do Windows="${settings.printerName || '(nao configurada)'}"`);
  if (settings.mode === 'escpos') console.log(`[config] impressora de rede=${settings.printerHost || '(nao configurada)'}:${settings.printerPort}`);
}

// A configuracao que vale e a do painel, porque e la que o usuario mexe.
// O que existir no config.json local continua tendo prioridade (caso especifico da maquina).
async function loadPanelSettings() {
  try {
    const remote = await request('/api/printer-config');
    if (!remote || typeof remote !== 'object') return;
    if (!localOverrides.mode && remote.mode) settings.mode = remote.mode;
    if (!localOverrides.printerHost && remote.host) settings.printerHost = remote.host;
    if (!localOverrides.printerPort && remote.port) settings.printerPort = String(remote.port);
    if (!localOverrides.printerName && remote.printerName) settings.printerName = remote.printerName;
    if (!localOverrides.columns && remote.columns) settings.columns = Number(remote.columns);
    if (!localOverrides.maxLines && remote.maxLines !== undefined && remote.maxLines !== null) settings.maxLines = Number(remote.maxLines);
    if (typeof remote.layout === 'string' && remote.layout.trim()) settings.layout = remote.layout;
    if (!localOverrides.pollMs && remote.pollSeconds) settings.pollMs = Number(remote.pollSeconds) * 1000;
    lastConfigError = '';
  } catch (error) {
    if (lastConfigError !== error.message) {
      console.warn(`[config] Nao foi possivel ler a configuracao do painel: ${error.message}`);
      lastConfigError = error.message;
    }
  }
}

async function warnMissingPrinter() {
  console.warn('[config] O modo USB esta ativo, mas nenhuma impressora do Windows foi informada.');
  try {
    const printers = await listWindowsPrinters();
    const nomes = printers.map((printer) => printer.name);
    if (nomes.length) console.log(`[config] Impressoras instaladas neste PC: ${nomes.join(' | ')}`);
    else console.warn('[config] Nenhuma impressora instalada no Windows foi encontrada.');
    console.log('[config] Coloque o nome exato em "printerName" no config.json ou escolha a impressora na tela de impressao do painel.');
  } catch (error) {
    console.warn(`[config] ${error.message}`);
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Servidor antigo: a rota cai no manipulador do WhatsApp e responde esse erro.
    if (response.status === 400 && data.message?.includes('nome do restaurante')) {
      throw new Error('A VPS esta com uma versao antiga e ainda nao possui as rotas de impressao. Atualize o servidor AtendeAI.');
    }
    throw new Error(data.message || `Servidor respondeu ${response.status}.`);
  }
  return data;
}

async function printVirtual(job, receipt) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const file = path.join(outputDirectory, `pedido-${job.id}-${Date.now()}.txt`);
  await fs.writeFile(file, receipt, 'utf8');
  console.log(`[virtual] Pedido ${job.order_number} salvo em ${file}`);
}

async function printJob(job) {
  // Largura, altura e layout vem do painel: o cupom sai igual ao que o usuario montou.
  const receipt = formatOrder(job, { columns: settings.columns, maxLines: settings.maxLines, layout: settings.layout });
  if (settings.mode === 'virtual') return printVirtual(job, receipt);
  if (settings.mode === 'usb') {
    if (!settings.printerName) throw new Error('Nenhuma impressora USB configurada. Escolha uma na tela de impressao do painel.');
    await printWindowsRaw(receipt, { printerName: settings.printerName });
    return console.log(`[usb] Pedido ${job.order_number} enviado para "${settings.printerName}".`);
  }
  if (settings.mode === 'escpos') {
    if (!settings.printerHost) throw new Error('Nenhuma impressora de rede configurada.');
    await printEscPos(receipt, { host: settings.printerHost, port: settings.printerPort });
    return console.log(`[escpos] Pedido ${job.order_number} enviado para ${settings.printerHost}:${settings.printerPort}.`);
  }
  throw new Error(`Modo de impressao desconhecido: ${settings.mode}. Use virtual, usb ou escpos.`);
}

/* ---------------------------------------------------------------------------
   Deteccao automatica das impressoras locais
   Quem escolhe a impressora e o painel; o agente so descobre o que existe
   fisicamente ligado neste computador e envia a lista para o servidor.
--------------------------------------------------------------------------- */

let printerCache = { list: [], error: '', at: 0 };

async function detectPrinters({ force = false } = {}) {
  // A lista muda pouco; evitar rodar o PowerShell a cada ciclo economiza CPU.
  if (!force && printerCache.at && Date.now() - printerCache.at < 60_000) return printerCache;
  try {
    const list = await listWindowsPrinters();
    printerCache = { list, error: '', at: Date.now() };
  } catch (error) {
    printerCache = { list: [], error: error.message || 'Nao foi possivel listar as impressoras.', at: Date.now() };
  }
  return printerCache;
}

// Escolhe a impressora automaticamente quando o painel ainda nao decidiu:
// prefere uma ligada na USB, senao a primeira instalada.
function pickAutomaticPrinter(list) {
  if (!list.length) return '';
  const usb = list.find((printer) => printer.usb);
  return (usb || list[0]).name;
}

/* ---------------------------------------------------------------------------
   Comunicacao com o painel
   Um unico POST periodico informa tudo: impressoras encontradas, impressora
   em uso e o estado atual. O painel guarda e mostra na tela de impressao.
--------------------------------------------------------------------------- */

let lastReportAt = 0;
let lastReportError = '';
// Fila local do que ja saiu nesta maquina. Alem de alimentar a tela do painel,
// evita que o mesmo cupom seja impresso duas vezes se o servidor nao responder.
const localActivity = [];

function addActivity(type, message, job) {
  localActivity.push({ at: new Date().toISOString(), type, message, orderNumber: job?.order_number || '' });
  if (localActivity.length > 200) localActivity.splice(0, localActivity.length - 200);
}

async function reportToPanel({ force = false } = {}) {
  // Relatorio a cada 10s no maximo, para nao sobrecarregar o servidor.
  if (!force && Date.now() - lastReportAt < 10_000) return;
  lastReportAt = Date.now();
  try {
    const { list, error } = await detectPrinters();
    // Se nao ha impressora escolhida ainda, o agente adota uma sozinho.
    if (!settings.printerName && list.length) {
      settings.printerName = pickAutomaticPrinter(list);
      if (settings.mode !== 'virtual') settings.mode = 'usb';
      console.log(`[usb] Impressora detectada automaticamente: "${settings.printerName}".`);
    }
    await request('/api/printer-agent/report', {
      method: 'POST',
      body: JSON.stringify({
        version: AGENT_VERSION,
        machineName,
        platform: `${os.platform()} ${os.release()}`,
        mode: settings.mode,
        printerName: settings.printerName,
        columns: settings.columns,
        maxLines: settings.maxLines,
        pollMs: settings.pollMs,
        connected: !lastPollError,
        lastError: lastPollError || error || '',
        printers: list,
        activity: localActivity.slice(-20),
        at: new Date().toISOString(),
      }),
    });
    lastReportError = '';
  } catch (error) {
    if (lastReportError !== error.message) {
      console.error(`[agente] Nao foi possivel avisar o painel: ${error.message}`);
      lastReportError = error.message;
    }
  }
}

async function poll() {
  try {
    if (pollCount++ % 12 === 0) await loadPanelSettings();
    const { jobs } = await request('/api/print-jobs');
    lastPollError = '';

    if (!jobs.length) {
      await reportToPanel();
      return;
    }

    for (const job of jobs) {
      addActivity('printing', 'Enviando para a impressora...', job);
      try {
        await printJob(job);
        addActivity('printed', 'Cupom impresso com sucesso.', job);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'printed' }) });
      } catch (error) {
        console.error(`[erro] Pedido ${job.order_number}: ${error.message}`);
        addActivity('failed', error.message, job);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', errorMessage: error.message }) });
      }
    }
    // Fila mudou: manda o estado novo para o painel na hora.
    await reportToPanel({ force: true });
  } catch (error) {
    lastPollError = error.message;
    if (lastConfigError !== error.message) console.error(`[agente] ${error.message}`);
    await reportToPanel({ force: true });
  }
}

function testJob() {
  return {
    id: 'teste',
    order_number: `TESTE-${Date.now()}`,
    created_at: new Date().toISOString(),
    payload: {
      items: [{ quantity: 2, name: 'X-Burger', price: 25, notes: 'Sem cebola' }],
      total: 50,
      customer: 'Cliente de teste',
      notes: 'Cupom de teste gerado pelo AtendePrint',
    },
  };
}

/* ---------------------------------------------------------------------------
   Inicializacao
--------------------------------------------------------------------------- */

const programName = process.pkg ? path.basename(process.execPath) : 'node agent.js';
const commandHint = process.pkg ? `"${programName}"` : programName;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`AtendePrint - Agente de Impressao AtendeAI

Uso:
  ${commandHint}                     Roda em segundo plano e imprime os pedidos
  ${commandHint} --test              Envia um cupom de teste usando o modo configurado
  ${commandHint} --list-printers     Lista as impressoras instaladas no Windows

O agente nao tem tela: ele roda escondido e aparece no painel web, na tela de
impressao, junto com as impressoras USB detectadas neste computador.

Modos de impressao (config.json ou variaveis de ambiente):
  virtual   Salva o cupom em .txt na pasta output (teste sem impressora)
  usb       Envia ESC/POS bruto para uma impressora instalada no Windows (USB)
  escpos    Envia ESC/POS bruto para uma impressora de rede (IP:porta)

Variaveis de ambiente: ATENDEAI_API_URL, ATENDEAI_PRINT_MODE, PRINTER_NAME,
PRINTER_HOST, PRINTER_PORT, PRINTER_COLUMNS, PRINTER_MAX_LINES, ATENDEAI_POLL_MS`);
} else if (process.argv.includes('--list-printers')) {
  try {
    const printers = await listWindowsPrinters();
    if (printers.length) {
      console.log('Impressoras instaladas neste Windows:');
      printers.forEach((printer) => {
        const porta = printer.port ? ` | porta: ${printer.port}` : '';
        const tipo = printer.usb ? 'USB' : 'outra';
        console.log(`  - ${printer.name} (${tipo}${porta})`);
      });
    } else {
      console.log('Nenhuma impressora instalada no Windows foi encontrada.');
    }
  } catch (error) {
    console.error(`[erro] ${error.message}`);
    process.exitCode = 1;
  }
} else if (process.argv.includes('--test')) {
  try {
    await loadPanelSettings();
    await printJob(testJob());
    console.log(`[teste] Cupom enviado com sucesso no modo ${settings.mode}.`);
  } catch (error) {
    console.error(`[teste] Falhou no modo ${settings.mode}: ${error.message}`);
    if (settings.mode === 'usb') await warnMissingPrinter();
    process.exitCode = 1;
  }
} else {
  // Sempre oculto. Um agente por maquina; o segundo apenas encerra.
  if (!(await acquireSingleInstanceLock({ quiet: true }))) {
    console.log('[agente] Ja existe um AtendePrint rodando neste computador.');
    process.exit(0);
  }

  const encerrar = async () => {
    await releaseSingleInstanceLock();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
  process.on('exit', () => {
    fs.rm(lockFile, { force: true }).catch(() => {});
  });

  console.log(`AtendePrint - Agente de Impressao AtendeAI ${AGENT_VERSION}`);
  console.log(`[config] arquivo lido: ${loadedConfigPath || '(nenhum)'}`);
  if (configError) console.warn(`[config] ${configError} em ${runtimeDirectory}. Veja printer-agent/README.md.`);
  await loadPanelSettings();
  describeSettings();

  // Descobre as impressoras e avisa o painel antes de comecar a imprimir, para a
  // tela de impressao ja abrir mostrando a impressora USB conectada.
  await reportToPanel({ force: true });
  if (settings.mode === 'usb' && !settings.printerName) await warnMissingPrinter();
  console.log(`[agente] Rodando em segundo plano (servico). Impressoras do PC sao enviadas para o painel.`);

  await poll();
  setInterval(() => {
    poll().catch((error) => console.error(`[agente] ${error.message}`));
  }, settings.pollMs);
}
