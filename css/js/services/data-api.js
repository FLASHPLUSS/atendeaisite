async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível comunicar com o servidor.');
  return data;
}

export function getMenuItems() {
  return request('/api/menu');
}

export function getPhysicalMenu() {
  return request('/api/physical-menu');
}

export function savePhysicalMenu(menu) {
  return request('/api/physical-menu', { method: 'PUT', body: JSON.stringify(menu) });
}

export function createMenuItem(item) {
  return request('/api/menu', { method: 'POST', body: JSON.stringify(item) });
}

export function updateRestaurantSettings(settings) {
  return request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export function connectRealtime(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  socket.addEventListener('message', (event) => {
    try { onMessage(JSON.parse(event.data)); } catch { /* Ignora mensagens inválidas. */ }
  });
  return socket;
}
