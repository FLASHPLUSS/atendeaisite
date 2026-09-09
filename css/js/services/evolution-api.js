const STORAGE_KEY = 'atende-evolution-state';

function demoQrCode() {
  const cells = Array.from({ length: 25 }, (_, index) => `<rect x="${(index % 5) * 12}" y="${Math.floor(index / 5) * 12}" width="8" height="8" rx="1"/>`).join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="white"/><g fill="#102b25">${cells}</g><rect x="6" y="6" width="16" height="16" fill="none" stroke="#ff765e" stroke-width="4"/><rect x="38" y="6" width="16" height="16" fill="none" stroke="#9bdc68" stroke-width="4"/><rect x="6" y="38" width="16" height="16" fill="none" stroke="#9bdc68" stroke-width="4"/></svg>`)}`;
}

function readState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"connected":false}');
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function instanceName() {
  const restaurant = JSON.parse(localStorage.getItem('atende-restaurant-config') || '{}');
  if (!restaurant.name?.trim()) throw new Error('Configure o nome do restaurante antes de conectar o WhatsApp.');
  return restaurant.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function request(path, options = {}) {
  const instance = encodeURIComponent(instanceName());
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`/api/evolution${path}${separator}instance=${instance}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível comunicar com a Evolution API.');
  return data;
}

export async function getConnectionState() {
  const state = readState();
  try {
    const remote = await request('/status');
    return writeState({ ...state, ...remote, connected: Boolean(remote.connected) });
  } catch (error) {
    return writeState({ ...state, error: error.message });
  }
}

export async function connectWhatsApp() {
  const state = readState();
  try {
    const remote = await request('/connect');
    return writeState({ ...state, ...remote, qrCode: remote.base64 || remote.qrcode?.base64 || remote.qrcode, connected: false });
  } catch (error) {
    return writeState({ ...state, qrCode: null, connected: false, error: error.message || 'Falha ao conectar com a Evolution API.' });
  }
}

export async function disconnectWhatsApp() {
  const state = readState();
  try { await request('/disconnect', { method: 'POST' }); } catch (error) { return writeState({ ...state, error: error.message }); }
  return writeState({ ...state, connected: false, qrCode: null, phone: null, error: null });
}

export function setDemoConnected() {
  return writeState({ ...readState(), connected: true, qrCode: null, phone: '+55 11 99876-5432' });
}
