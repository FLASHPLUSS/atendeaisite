import { WebSocketServer } from 'ws';

export function createRealtimeServer(server) {
  const websocketServer = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();
  const heartbeatMs = Number(process.env.WS_HEARTBEAT_MS || 30000);
  websocketServer.on('connection', (socket) => {
    socket.isAlive = true;
    clients.add(socket);
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', () => clients.delete(socket));
    socket.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });
  const heartbeat = setInterval(() => {
    clients.forEach((socket) => {
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, heartbeatMs);
  heartbeat.unref?.();
  websocketServer.on('close', () => clearInterval(heartbeat));
  return { broadcast(type, data) { const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() }); clients.forEach((socket) => { if (socket.readyState === 1) socket.send(message); }); } };
}