// Monta o cupom que vai para a impressora termica.
//
// Tudo aqui e configuravel pelo painel web: a LARGURA (colunas), a ALTURA
// (quantas linhas o cupom pode ter) e o LAYOUT (o texto do comprovante, com
// marcadores como {{itens}} e {{total}}).

const DEFAULT_COLUMNS = 42;
// Altura padrao: 0 = cupom do tamanho do pedido. Valores > 0 limitam/esticam.
const DEFAULT_MAX_LINES = 0;

// Layout de fabrica. Os marcadores disponiveis estao documentados no painel.
export const DEFAULT_LAYOUT = [
  '{{loja}}',
  'PEDIDO {{pedido}}',
  '{{data}}',
  '{{linha}}',
  '{{itens}}',
  '{{linha}}',
  'TOTAL: R$ {{total}}',
  '{{cliente}}',
  '{{observacoes}}',
  '{{linha}}',
  'Obrigado pela preferencia!',
].join('\n');

function toColumns(value, columns) {
  return String(value ?? '').slice(0, columns);
}

// Coloca o texto a esquerda e o valor a direita, preenchendo o espaco do meio.
function padBetween(left, right, columns) {
  const l = toColumns(left, columns);
  const r = toColumns(right, columns);
  const space = columns - l.length - r.length;
  if (space <= 0) return toColumns(`${l} ${r}`, columns);
  return `${l}${' '.repeat(space)}${r}`;
}

export function formatItems(items, columns = DEFAULT_COLUMNS) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return 'Pedido de teste - sem itens';
  const lines = [];
  list.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const total = (quantity * price).toFixed(2).replace('.', ',');
    lines.push(padBetween(`${quantity}x ${item.name || 'Produto'}`, `R$ ${total}`, columns));
    if (item.notes) lines.push(`   Obs: ${toColumns(item.notes, columns - 8)}`);
  });
  return lines.join('\n');
}

function money(value) {
  return Number(value || 0).toFixed(2).replace('.', ',');
}

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString('pt-BR');
}

// Substitui os marcadores do layout pelos dados reais do pedido.
// Linhas que ficarem vazias (ex.: pedido sem observacao) sao removidas para nao
// sobrar espaco em branco no cupom.
function applyLayout(layout, job, columns) {
  const order = job.payload || {};
  const restaurant = order.restaurant || {};
  const values = {
    loja: restaurant.name || order.storeName || '',
    pedido: job.order_number || '',
    data: formatDate(job.created_at),
    hora: new Date(job.created_at || Date.now()).toLocaleTimeString('pt-BR'),
    itens: formatItems(order.items, columns),
    total: money(order.total),
    cliente: order.customer ? `Cliente: ${order.customer}` : '',
    telefone: order.phone || order.customerPhone ? `Telefone: ${order.phone || order.customerPhone}` : '',
    endereco: order.address ? `Endereco: ${order.address}` : '',
    observacoes: order.notes ? `Obs: ${order.notes}` : '',
    linha: '-'.repeat(columns),
  };

  return layout
    .split('\n')
    .map((rawLine) => {
      // Um marcador sozinho na linha: se o dado estiver vazio, a linha toda sai.
      const only = rawLine.trim().match(/^\{\{([a-z]+)\}\}$/i);
      if (only && !String(values[only[1].toLowerCase()] ?? '').trim()) return null;
      const replaced = rawLine.replace(/\{\{([a-z]+)\}\}/gi, (match, key) => {
        const value = values[String(key).toLowerCase()];
        return value === undefined ? match : String(value);
      });
      return replaced;
    })
    .filter((line) => line !== null)
    // Cada marcador pode gerar varias linhas (os itens), entao dividimos de novo.
    .flatMap((line) => String(line).split('\n'));
}

// A altura do cupom: corta o excesso ou completa com linhas em branco para o
// operador saber que o cupom terminou naquele ponto.
function applyHeight(lines, maxLines) {
  if (!maxLines || maxLines <= 0) return lines;
  if (lines.length > maxLines) {
    // Mantem o rodape visivel: corta o miolo, nao o final.
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = lines[lines.length - 1];
    return kept;
  }
  return lines.concat(Array.from({ length: maxLines - lines.length }, () => ''));
}

export function formatOrder(job, { columns = DEFAULT_COLUMNS, maxLines = DEFAULT_MAX_LINES, layout } = {}) {
  const safeColumns = Math.min(Math.max(Number(columns) || DEFAULT_COLUMNS, 20), 80);
  const safeLines = Math.min(Math.max(Number(maxLines) || 0, 0), 200);
  const template = typeof layout === 'string' && layout.trim() ? layout : DEFAULT_LAYOUT;
  const rendered = applyLayout(template, job, safeColumns).map((value) => toColumns(value, safeColumns));
  return applyHeight(rendered, safeLines).join('\n');
}
