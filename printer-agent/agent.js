import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOrder } from './formatter.js';
import { printEscPos } from './escpos.js';
import { listWindowsPrinters, printWindowsRaw } from './windows-printer.js';
import { createUiServer, choosePort, openAppWindow } from './ui-server.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = process.pkg ? path.dirname(process.execPath) : directory;
// Rodando pelo Node o config.json pode estar na pasta do agente ou em dist/ (ao lado do executável).
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

async function acquireSingleInstanceLock({ quiet = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') return true;
      const previous = Number((await fs.readFile(lockFile, 'utf8').catch(() => '')).trim());
      if (previous && previous !== process.pid && processIsAlive(previous)) {
        // Na tela isso nao e erro: significa que o programa ja esta rodando.
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
  pollMs: firstValue(process.env.ATENDEAI_POLL_MS, savedConfig.pollSeconds ? savedConfig.pollSeconds * 1000 : undefined),
};

const settings = {
  mode: localOverrides.mode || 'virtual',
  printerHost: localOverrides.printerHost || '',
  printerPort: localOverrides.printerPort || '9100',
  printerName: localOverrides.printerName || '',
  columns: Number(localOverrides.columns || 42),
  pollMs: Number(localOverrides.pollMs || 5000),
};

function describeSettings() {
  console.log(`[config] modo=${settings.mode} | colunas=${settings.columns} | busca=${settings.pollMs / 1000}s`);
  if (settings.mode === 'usb') console.log(`[config] impressora do Windows="${settings.printerName || '(nao configurada)'}"`);
  if (settings.mode === 'escpos') console.log(`[config] impressora de rede=${settings.printerHost || '(nao configurada)'}:${settings.printerPort}`);
}

async function loadPanelSettings() {
  try {
    const remote = await request('/api/printer-config');
    if (!remote || typeof remote !== 'object') return;
    if (!localOverrides.mode && remote.mode) settings.mode = remote.mode;
    if (!localOverrides.printerHost && remote.host) settings.printerHost = remote.host;
    if (!localOverrides.printerPort && remote.port) settings.printerPort = String(remote.port);
    if (!localOverrides.printerName && remote.printerName) settings.printerName = remote.printerName;
    if (!localOverrides.columns && remote.columns) settings.columns = Number(remote.columns);
    if (!localOverrides.pollMs && remote.pollSeconds) settings.pollMs = Number(remote.pollSeconds) * 1000;
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
    if (printers.length) console.log(`[config] Impressoras instaladas neste PC: ${printers.join(' | ')}`);
    else console.warn('[config] Nenhuma impressora instalada no Windows foi encontrada.');
    console.log('[config] Rode o agente com --list-printers e coloque o nome exato em "printerName" no config.json.');
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
  const receipt = formatOrder(job, { columns: settings.columns });
  if (settings.mode === 'virtual') return printVirtual(job, receipt);
  if (settings.mode === 'usb') {
    await printWindowsRaw(receipt, { printerName: settings.printerName });
    return console.log(`[usb] Pedido ${job.order_number} enviado para "${settings.printerName}".`);
  }
  if (settings.mode === 'escpos') {
    await printEscPos(receipt, { host: settings.printerHost, port: settings.printerPort });
    return console.log(`[escpos] Pedido ${job.order_number} enviado para ${settings.printerHost}:${settings.printerPort}.`);
  }
  throw new Error(`Modo de impressao desconhecido: ${settings.mode}. Use virtual, usb ou escpos.`);
}

async function poll() {
  try {
    if (pollCount++ % 12 === 0) await loadPanelSettings();
    const { jobs } = await request('/api/print-jobs');
    uiState.connected = true;

    if (!jobs.length) {
      // Nada para imprimir agora: a tela continua espelhando a fila real.
      if (ui) await syncQueue();
      uiPush();
      return;
    }

    for (const job of jobs) {
      // A janela passa a mostrar exatamente o pedido que esta saindo na impressora.
      uiState.printingJob = toQueueItem(job);
      addActivity('printing', 'Enviando para a impressora...', job);
      uiPush();
      try {
        await printJob(job);
        uiState.counters.printed += 1;
        addActivity('printed', 'Cupom impresso com sucesso.', job);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'printed' }) });
      } catch (error) {
        console.error(`[erro] Pedido ${job.order_number}: ${error.message}`);
        uiState.counters.failed += 1;
        addActivity('failed', error.message, job);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', errorMessage: error.message }) });
      } finally {
        uiState.printingJob = null;
        uiPush();
      }
    }
    if (ui) await syncQueue();
    uiPush();
  } catch (error) {
    uiState.connected = false;
    if (lastPollError !== error.message) {
      console.error(`[agente] ${error.message}`);
      lastPollError = error.message;
    }
    uiPush();
  }
}

function testJob() {
  return { id: 'teste', order_number: 'TESTE-001', created_at: new Date().toISOString(), payload: { items: [{ quantity: 2, name: 'X-Burger', price: 25 }], total: 50, notes: 'Teste pelo agente' } };
}

/* ---------------------------------------------------------------------------
   Tela grafica (AtendePrint)
   A janela nunca recebe o endereco do painel: getUiState() devolve apenas o
   estado da impressao, e o dominio fica só dentro deste processo.
--------------------------------------------------------------------------- */

let ui = null; // servidor da janela, criado quando o modo grafico esta ativo
const uiState = {
  connected: false,
  printers: { loading: false, list: [], error: '' },
  queue: [],
  activity: [],
  printingJob: null,
  counters: { printed: 0, failed: 0 },
  busyTest: false,
};

function addActivity(type, message, job) {
  uiState.activity.push({
    at: new Date().toISOString(),
    type,
    message,
    orderNumber: job?.order_number || '',
  });
  // A janela mostra a fila e o historico recente, nao a noite inteira.
  if (uiState.activity.length > 200) uiState.activity.splice(0, uiState.activity.length - 200);
}

function uiPush() {
  if (ui) ui.push();
}

function toQueueItem(job) {
  return {
    id: job.id,
    order_number: job.order_number,
    created_at: job.created_at,
    payload: job.payload || {},
  };
}

// /api/orders e somente leitura (nao consome a fila), por isso a janela pode
// mostrar a fila real sem roubar pedidos do loop de impressao.
async function syncQueue() {
  try {
    const { orders } = await request('/api/orders');
    if (!Array.isArray(orders)) return;
    const hoje = new Date().toDateString();
    // Fila de espera: quem chegou primeiro sai primeiro.
    uiState.queue = orders
      .filter((order) => order.status === 'pending')
      .map(toQueueItem)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    uiState.counters.printed = orders.filter(
      (order) => order.status === 'printed' && order.printed_at && new Date(order.printed_at).toDateString() === hoje,
    ).length;
    uiState.counters.failed = orders.filter(
      (order) => order.status === 'failed' && order.created_at && new Date(order.created_at).toDateString() === hoje,
    ).length;
  } catch {
    // Servidores antigos nao tem /api/orders: a fila fica com o que o agente recebeu.
  }
}

async function refreshPrinters() {
  uiState.printers = { ...uiState.printers, loading: true, error: '' };
  uiPush();
  try {
    const printers = await listWindowsPrinters();
    uiState.printers = { loading: false, list: printers, error: '' };
    if (!printers.length) return { ok: false, error: 'Nenhuma impressora encontrada neste Windows.' };
    return { ok: true, count: printers.length };
  } catch (error) {
    const message = error.message || 'Nao foi possivel listar as impressoras do Windows.';
    uiState.printers = { loading: false, list: [], error: message };
    return { ok: false, error: message };
  } finally {
    uiPush();
  }
}

async function saveRuntimeConfig(patch) {
  const target = path.join(runtimeDirectory, 'config.json');
  savedConfig = { ...savedConfig, ...patch };
  await fs.writeFile(target, `${JSON.stringify(savedConfig, null, 2)}\n`, 'utf8');
  if (!loadedConfigPath) loadedConfigPath = target;
}

async function setPrinterFromUi(name) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Nome de impressora invalido.' };
  const disponiveis = uiState.printers.list.length ? uiState.printers.list : await listWindowsPrinters();
  if (!disponiveis.includes(name)) return { ok: false, error: `A impressora "${name}" nao esta disponivel agora.` };
  settings.printerName = name;
  if (settings.mode !== 'usb') settings.mode = 'usb';
  await saveRuntimeConfig({ printerName: name, mode: settings.mode });
  addActivity('info', `Impressora alterada para "${name}".`);
  console.log(`[config] impressora alterada pela tela: "${name}"`);
  uiPush();
  return { ok: true };
}

async function testPrintFromUi() {
  if (uiState.busyTest) return { ok: false, error: 'Ja existe um teste em andamento.' };
  uiState.busyTest = true;
  uiPush();
  try {
    await printJob(testJob());
    addActivity('info', `Cupom de teste enviado no modo ${settings.mode}.`);
    return { ok: true };
  } catch (error) {
    addActivity('failed', `Teste falhou: ${error.message}`);
    return { ok: false, error: error.message };
  } finally {
    uiState.busyTest = false;
    uiPush();
  }
}

// Estado entregue a janela. Nunca inclui apiUrl nem qualquer dado do painel.
function getUiState() {
  return {
    connected: uiState.connected,
    mode: settings.mode,
    printerName: settings.printerName,
    columns: settings.columns,
    pollMs: settings.pollMs,
    counters: uiState.counters,
    queue: uiState.queue,
    activity: uiState.activity.slice(-60),
    printingJob: uiState.printingJob,
    printers: uiState.printers,
    lastError: lastPollError,
  };
}

async function startUi() {
  const preferredPort = Number(process.env.ATENDEAI_UI_PORT || 8787);
  const port = await choosePort(preferredPort);
  ui = await createUiServer({
    port,
    getState: getUiState,
    actions: {
      refreshPrinters,
      setPrinter: setPrinterFromUi,
      testPrint: testPrintFromUi,
    },
  });
  // A janela tambem avisa quando terminou de carregar as impressoras.
  await refreshPrinters();
  return ui;
}

// O segundo clique no atalho nao pode iniciar outro agente: apenas reabre a janela.
const uiInfoFile = path.join(runtimeDirectory, '.ui.json');

async function saveUiInfo(info) {
  await fs.writeFile(uiInfoFile, JSON.stringify(info), 'utf8').catch(() => {});
}

// O agente que acabou de subir pode ainda nao ter gravado o endereco da tela,
// por isso tentamos algumas vezes antes de desistir.
async function openRunningUi(tentativas = 6) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const info = JSON.parse(await fs.readFile(uiInfoFile, 'utf8'));
      if (info?.url) {
        openAppWindow(info.url);
        return true;
      }
    } catch {
      // ainda nao existe: espera um pouco e tenta de novo
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// No .exe empacotado nao existe "node agent.js": os exemplos usam o nome do proprio executavel.
const programName = process.pkg ? path.basename(process.execPath) : 'node agent.js';
const commandHint = process.pkg ? `"${programName}"` : programName;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`AtendePrint - Agente de Impressao AtendeAI

Uso:
  ${commandHint}                     Abre a tela do AtendePrint e imprime os pedidos
  ${commandHint} --background        Roda sem abrir a janela (modo servico)
  ${commandHint} --test              Envia um cupom de teste usando o modo configurado
  ${commandHint} --list-printers     Lista as impressoras instaladas no Windows

Modos de impressao (config.json ou variaveis de ambiente):
  virtual   Salva o cupom em .txt na pasta output (teste sem impressora)
  usb       Envia ESC/POS bruto para uma impressora instalada no Windows (USB)
  escpos    Envia ESC/POS bruto para uma impressora de rede (IP:porta)

A tela mostra as impressoras disponiveis agora, a fila de espera e os pedidos
saindo na impressora em tempo real. O endereco do painel nao aparece na tela.

Variaveis de ambiente: ATENDEAI_API_URL, ATENDEAI_PRINT_MODE, PRINTER_NAME,
PRINTER_HOST, PRINTER_PORT, PRINTER_COLUMNS, ATENDEAI_POLL_MS, ATENDEAI_UI_PORT`);
} else if (process.argv.includes('--list-printers')) {
  try {
    const printers = await listWindowsPrinters();
    if (printers.length) {
      console.log('Impressoras instaladas neste Windows (use o nome exato em "printerName"):');
      printers.forEach((name) => console.log(`  - ${name}`));
    } else {
      console.log('Nenhuma impressora instalada no Windows foi encontrada.');
    }
  } catch (error) {
    console.error(`[erro] ${error.message}`);
    process.exitCode = 1;
  }
} else if (process.argv.includes('--test')) {
  try {
    await printJob(testJob());
    console.log(`[teste] Cupom enviado com sucesso no modo ${settings.mode}.`);
  } catch (error) {
    console.error(`[teste] Falhou no modo ${settings.mode}: ${error.message}`);
    if (settings.mode === 'usb') await warnMissingPrinter();
    process.exitCode = 1;
  }
} else {
  // Atalho clicado duas vezes: em vez de brigar pela trava, so reabre a janela.
  const oculto = process.argv.includes('--background') || process.argv.includes('--headless');
  if (!(await acquireSingleInstanceLock({ quiet: !oculto }))) {
    if (!oculto && (await openRunningUi())) {
      console.log('[ui] O AtendePrint ja esta rodando. Reabrindo a tela...');
      setTimeout(() => process.exit(0), 1200);
    } else {
      process.exit(0);
    }
  } else {
    const encerrar = async () => {
      await releaseSingleInstanceLock();
      await fs.rm(uiInfoFile, { force: true }).catch(() => {});
      process.exit(0);
    };
    process.on('SIGINT', encerrar);
    process.on('SIGTERM', encerrar);
    process.on('exit', () => {
      fs.rm(lockFile, { force: true }).catch(() => {});
      fs.rm(uiInfoFile, { force: true }).catch(() => {});
    });

    console.log('AtendePrint - Agente de Impressao AtendeAI');
    console.log(`[config] arquivo lido: ${loadedConfigPath || '(nenhum)'}`);
    if (configError) console.warn(`[config] ${configError} em ${runtimeDirectory}. Veja printer-agent/README.md.`);
    await loadPanelSettings();
    describeSettings();
    if (settings.mode === 'usb' && !settings.printerName) await warnMissingPrinter();

    if (!oculto) {
      try {
        const servidor = await startUi();
        await saveUiInfo({ port: servidor.port, pid: process.pid, url: servidor.url });
        const janela = openAppWindow(servidor.url);
        console.log(`[ui] Tela do AtendePrint em http://127.0.0.1:${servidor.port} (somente neste computador).`);
        if (!janela) console.log('[ui] Abra o endereco acima no navegador para ver a fila e as impressoras.');
      } catch (error) {
        console.error(`[ui] Nao foi possivel abrir a tela: ${error.message}`);
      }
    } else {
      // Mesmo sem janela o servidor local sobe: clicar no atalho de novo abre a tela.
      try {
        const servidor = await startUi();
        await saveUiInfo({ port: servidor.port, pid: process.pid, url: servidor.url });
        console.log('[ui] Rodando em segundo plano. Abra o atalho da Area de Trabalho para ver a tela.');
      } catch (error) {
        console.error(`[ui] Nao foi possivel iniciar a tela: ${error.message}`);
      }
    }

    await poll();
    setInterval(poll, settings.pollMs);
  }
}
