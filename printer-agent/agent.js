import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOrder } from './formatter.js';
import { printEscPos } from './escpos.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = process.pkg ? path.dirname(process.execPath) : directory;
let savedConfig = {};
try { savedConfig = JSON.parse(await fs.readFile(path.join(runtimeDirectory, 'config.json'), 'utf8')); } catch { /* Usa variáveis de ambiente e padrões. */ }
const apiUrl = (process.env.ATENDEAI_API_URL || savedConfig.apiUrl || 'http://localhost:3000').replace(/\/$/, '');
const mode = process.env.ATENDEAI_PRINT_MODE || savedConfig.mode || 'virtual';
const interval = Number(process.env.ATENDEAI_POLL_MS || savedConfig.pollSeconds * 1000 || 5000);
const outputDirectory = path.join(runtimeDirectory, 'output');
const printerHost = process.env.PRINTER_HOST || savedConfig.printerHost || '';
const printerPort = process.env.PRINTER_PORT || savedConfig.printerPort || '9100';

async function request(endpoint, options = {}) {
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Servidor respondeu ${response.status}.`);
  return data;
}

async function printVirtual(job, receipt) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const file = path.join(outputDirectory, `pedido-${job.id}-${Date.now()}.txt`);
  await fs.writeFile(file, receipt, 'utf8');
  console.log(`[virtual] Pedido ${job.order_number} salvo em ${file}`);
}

async function printJob(job) {
  const receipt = formatOrder(job);
  if (mode === 'virtual') return printVirtual(job, receipt);
  if (mode === 'escpos') return printEscPos(receipt, { host: printerHost, port: printerPort });
  throw new Error(`Modo de impressão desconhecido: ${mode}. Use virtual ou escpos.`);
}

async function poll() {
  try {
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
    console.error(`[agente] ${error.message}`);
  }
}

if (process.argv.includes('--test')) {
  await printVirtual({ id: 'teste', order_number: 'TESTE-001', created_at: new Date().toISOString(), payload: { items: [{ quantity: 2, name: 'X-Burger', price: 25 }], total: 50, notes: 'Sem cebola' } }, formatOrder({ id: 'teste', order_number: 'TESTE-001', created_at: new Date().toISOString(), payload: { items: [{ quantity: 2, name: 'X-Burger', price: 25 }], total: 50, notes: 'Sem cebola' } }));
} else {
  console.log(`AtendeAI Printer Agent | modo: ${mode} | servidor: ${apiUrl}`);
  await poll();
  setInterval(poll, interval);
}
