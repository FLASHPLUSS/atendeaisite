const width = 42;

function line(value = '') {
  return String(value).slice(0, width);
}

function divider() {
  return '-'.repeat(width);
}

export function formatOrder(job) {
  const order = job.payload || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const output = [
    'ATENDEAI - PEDIDO',
    `Pedido: ${job.order_number}`,
    `Data: ${new Date(job.created_at || Date.now()).toLocaleString('pt-BR')}`,
    divider(),
  ];
  items.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    output.push(`${quantity}x ${line(item.name || 'Produto')}`);
    output.push(`   R$ ${(quantity * price).toFixed(2).replace('.', ',')}`);
  });
  if (!items.length) output.push('Pedido de teste - sem itens');
  output.push(divider());
  output.push(`Total: R$ ${Number(order.total || 0).toFixed(2).replace('.', ',')}`);
  if (order.notes) output.push(`Obs: ${line(order.notes)}`);
  output.push('', 'Obrigado pela preferencia!', '', '');
  return output.join('\n');
}
