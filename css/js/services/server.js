import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRealtimeServer } from './websocket.js';
import { createMenuItem, createPrintJob, deleteMenuItem, getPhysicalMenu, getRestaurant, listMenu, listOrders, listPendingPrintJobs, migrate, pool, savePhysicalMenu, updateMenuItem, updatePrintJob, updateSettings } from './db.js';

const currentFile = fileURLToPath(import.meta.url);
const servicesDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(servicesDirectory, '..', '..', '..');
const envPath = path.join(projectRoot, '.env');

async function loadEnv() {
  try {
    const content = await fs.readFile(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch {
    // O servidor continua iniciando para exibir um erro de configuração legível.
  }
}

function instanceFromRequest(url) {
  const requested = url.searchParams.get('instance');
  if (!requested || !requested.trim()) {
    throw Object.assign(new Error('O nome do restaurante é obrigatório para criar a instância.'), { status: 400 });
  }
  const instance = requested.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!instance) throw Object.assign(new Error('O nome do restaurante é obrigatório para criar a instância.'), { status: 400 });
  return instance.slice(0, 80);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 30 * 1024 * 1024) throw Object.assign(new Error('Payload excede o limite de 30 MB.'), { status: 413 });
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

function requireDatabase() {
  if (!process.env.DATABASE_URL || !databaseReady) throw Object.assign(new Error('PostgreSQL ainda não está conectado. Verifique DATABASE_URL e a rede do servidor.'), { status: 503 });
}

async function evolutionRequest(endpoint, options = {}) {
  if (!EVOLUTION_KEY) throw new Error('EVOLUTION_API_KEY não configurada no arquivo .env.');
  const upstream = await fetch(`${EVOLUTION_URL.replace(/\/$/, '')}${endpoint}`, {
    ...options,
    headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await upstream.text();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch { data = { raw: body }; }
  if (!upstream.ok) {
    const error = new Error(data.message || `Evolution API respondeu ${upstream.status}.`);
    error.status = upstream.status;
    throw error;
  }
  return data;
}

async function ensureInstance(instance) {
  try {
    await evolutionRequest(`/instance/connectionState/${instance}`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await evolutionRequest('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName: instance, instance, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
  });
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const database = databaseReady;
    return sendJson(response, database ? 200 : 503, { ok: database, database, websocket: true });
  }
  if (url.pathname === '/api/menu' && request.method === 'GET') {
    requireDatabase();
    return sendJson(response, 200, await listMenu());
  }
  if (url.pathname === '/api/print-jobs' && request.method === 'GET') {
    requireDatabase();
    return sendJson(response, 200, { jobs: await listPendingPrintJobs() });
  }
  if (url.pathname === '/api/orders' && request.method === 'GET') {
    requireDatabase();
    return sendJson(response, 200, { orders: await listOrders() });
  }
  if (url.pathname === '/api/print-jobs' && request.method === 'POST') {
    requireDatabase();
    const job = await createPrintJob(await readJson(request));
    realtime.broadcast('print-job.created', job);
    return sendJson(response, 201, job);
  }
  const printJobMatch = url.pathname.match(/^\/api\/print-jobs\/(\d+)$/);
  if (printJobMatch && request.method === 'PATCH') {
    requireDatabase();
    const payload = await readJson(request);
    if (!['printing', 'printed', 'failed'].includes(payload.status)) throw Object.assign(new Error('Status de impressão inválido.'), { status: 400 });
    const job = await updatePrintJob(printJobMatch[1], payload);
    if (!job) return sendJson(response, 404, { message: 'Trabalho de impressão não encontrado.' });
    return sendJson(response, 200, job);
  }
  if (url.pathname === '/api/physical-menu' && request.method === 'GET') {
    requireDatabase();
    return sendJson(response, 200, await getPhysicalMenu());
  }
  if (url.pathname === '/api/physical-menu' && request.method === 'PUT') {
    requireDatabase();
    const menu = await savePhysicalMenu(await readJson(request));
    realtime.broadcast('physical-menu.updated', menu);
    return sendJson(response, 200, menu);
  }
  if (url.pathname === '/api/menu' && request.method === 'POST') {
    requireDatabase();
    const item = await createMenuItem(await readJson(request));
    realtime.broadcast('menu.created', item);
    return sendJson(response, 201, item);
  }
  const menuMatch = url.pathname.match(/^\/api\/menu\/(\d+)$/);
  if (menuMatch && request.method === 'PATCH') {
    requireDatabase();
    const item = await updateMenuItem(menuMatch[1], await readJson(request));
    if (!item) return sendJson(response, 404, { message: 'Item do cardápio não encontrado.' });
    realtime.broadcast('menu.updated', item);
    return sendJson(response, 200, item);
  }
  if (menuMatch && request.method === 'DELETE') {
    requireDatabase();
    const item = await deleteMenuItem(menuMatch[1]);
    if (!item) return sendJson(response, 404, { message: 'Item do cardápio não encontrado.' });
    realtime.broadcast('menu.deleted', { id: item.id });
    return sendJson(response, 200, item);
  }
  if (url.pathname === '/api/settings' && request.method === 'GET') {
    requireDatabase();
    return sendJson(response, 200, await getRestaurant());
  }
  if (url.pathname === '/api/settings' && request.method === 'PUT') {
    requireDatabase();
    const settings = await updateSettings(await readJson(request));
    realtime.broadcast('settings.updated', settings);
    return sendJson(response, 200, settings);
  }
  const instance = instanceFromRequest(url);
  if (url.pathname === '/api/evolution/status' && request.method === 'GET') {
    try {
      const data = await evolutionRequest(`/instance/connectionState/${instance}`);
      const state = data.instance?.state || data.state || 'unknown';
      return sendJson(response, 200, { connected: state === 'open', state, instance });
    } catch (error) {
      if (error.status === 404) {
        return sendJson(response, 200, { connected: false, state: 'disconnected', instance, message: 'Instância ainda não criada.' });
      }
      throw error;
    }
  }
  if (url.pathname === '/api/evolution/connect' && request.method === 'GET') {
    await ensureInstance(instance);
    const data = await evolutionRequest(`/instance/connect/${instance}`);
    return sendJson(response, 200, { ...data, instance });
  }
  if (url.pathname === '/api/evolution/disconnect' && request.method === 'POST') {
    const data = await evolutionRequest(`/instance/logout/${instance}`, { method: 'DELETE' });
    return sendJson(response, 200, { ...data, connected: false });
  }
  return sendJson(response, 404, { message: 'Endpoint não encontrado.' });
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(projectRoot, `.${requestedPath}`);
  if (!filePath.startsWith(projectRoot)) return sendJson(response, 403, { message: 'Acesso negado.' });
  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(file);
  } catch {
    sendJson(response, 404, { message: 'Arquivo não encontrado.' });
  }
}

await loadEnv();
const PORT = Number(process.env.PORT || 3000);
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://zapmesa.evolution.venusdev.xyz';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
let databaseReady = false;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    return await serveStatic(request, response, url);
  } catch (error) {
    sendJson(response, error.status || 500, { message: error.message || 'Erro interno do servidor.' });
  }
});

const realtime = createRealtimeServer(server);
if (process.env.DATABASE_URL) {
  migrate().then(() => { databaseReady = true; console.log('PostgreSQL conectado e schema verificado.'); }).catch((error) => console.error(`PostgreSQL indisponível: ${error.message}`));
} else {
  console.warn('DATABASE_URL ausente: painel inicia, mas a API de dados está desativada.');
}
server.listen(PORT, '0.0.0.0', () => console.log(`AtendeAI em http://localhost:${PORT} (WebSocket: /ws)`));
