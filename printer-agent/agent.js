import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOrder } from './formatter.js';
import { printEscPos } from './escpos.js';
import { listWindowsPrinters, printWindowsRaw } from './windows-printer.js';

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
    configError = error.code === 'ENOENT' ? 'config.json não encontrado' : `config.json inválido (${error.message})`;
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
  console.warn('[config] O modo USB está ativo, mas nenhuma impressora do Windows foi informada.');
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
      throw new Error('A VPS está com uma versão antiga e ainda não possui as rotas de impressão. Atualize o servidor AtendeAI.');
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
  throw new Error(`Modo de impressão desconhecido: ${settings.mode}. Use virtual, usb ou escpos.`);
}

async function poll() {
  try {
    if (pollCount++ % 12 === 0) await loadPanelSettings();
    const { jobs } = await request('/api/print-jobs');
    for (const job of jobs) {
      try {
        await printJob(job);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'printed' }) });
      } catch (error) {
        console.error(`[erro] Pedido ${job.order_number}: ${error.message}`);
        await request(`/api/print-jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', errorMessage: error.message }) });
      }
    }
  } catch (error) {
    if (lastPollError !== error.message) {
      console.error(`[agente] ${error.message}`);
      lastPollError = error.message;
    }
  }
}

function testJob() {
  return { id: 'teste', order_number: 'TESTE-001', created_at: new Date().toISOString(), payload: { items: [{ quantity: 2, name: 'X-Burger', price: 25 }], total: 50, notes: 'Teste pelo agente' } };
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`AtendeAI Printer Agent

Uso:
  node agent.js                     Inicia o agente e busca pedidos na plataforma
  node agent.js --test              Envia um cupom de teste usando o modo configurado
  node agent.js --list-printers     Lista as impressoras instaladas no Windows

Modos de impressão (config.json ou variáveis de ambiente):
  virtual   Salva o cupom em .txt na pasta output (teste sem impressora)
  usb       Envia ESC/POS bruto para uma impressora instalada no Windows (USB)
  escpos    Envia ESC/POS bruto para uma impressora de rede (IP:porta)

Variáveis de ambiente: ATENDEAI_API_URL, ATENDEAI_PRINT_MODE, PRINTER_NAME,
PRINTER_HOST, PRINTER_PORT, PRINTER_COLUMNS, ATENDEAI_POLL_MS`);
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
  console.log(`AtendeAI Printer Agent | servidor: ${apiUrl}`);
  if (loadedConfigPath) console.log(`[config] arquivo lido: ${loadedConfigPath}`);
  if (configError && !process.env.ATENDEAI_API_URL) console.warn(`[config] ${configError} em ${runtimeDirectory}: usando ${apiUrl}. Veja printer-agent/README.md.`);
  await loadPanelSettings();
  describeSettings();
  if (settings.mode === 'usb' && !settings.printerName) await warnMissingPrinter();
  await poll();
  setInterval(poll, settings.pollMs);
}
