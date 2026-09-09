import net from 'node:net';

function esc(value) {
  return Buffer.from(value, 'ascii');
}

export function formatEscPos(receipt) {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    esc(receipt),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
}

export function printEscPos(receipt, { host, port = 9100, timeout = 5000 }) {
  if (!host) throw new Error('PRINTER_HOST não configurado para o modo ESC/POS.');
  const data = formatEscPos(receipt);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Tempo excedido ao conectar na impressora.')); }, timeout);
    socket.once('connect', () => socket.end(data));
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    socket.once('close', (hadError) => { clearTimeout(timer); if (!hadError) resolve(); });
  });
}
