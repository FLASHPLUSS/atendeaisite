import net from 'node:net';

// Impressoras termicas trabalham com codepages fixas (CP437/CP850/CP860) e nao
// entendem UTF-8. Removemos os acentos para o cupom nunca sair com lixo.
export function toAscii(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\t\n\r\x20-\x7e]/g, '?');
}

function esc(value) {
  return Buffer.from(toAscii(value), 'ascii');
}

export function formatEscPos(receipt) {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @ - inicializa a impressora
    esc(receipt),
    Buffer.from([0x1b, 0x64, 0x03]), // ESC d 3 - avanca 3 linhas antes do corte
    Buffer.from([0x1d, 0x56, 0x00]), // GS V 0 - corte total do papel
  ]);
}

export function printEscPos(receipt, { host, port = 9100, timeout = 5000 }) {
  if (!host) throw new Error('PRINTER_HOST nao configurado para o modo ESC/POS.');
  const data = formatEscPos(receipt);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Tempo excedido ao conectar na impressora.')); }, timeout);
    socket.once('connect', () => socket.end(data));
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    socket.once('close', (hadError) => { clearTimeout(timer); if (!hadError) resolve(); });
  });
}
