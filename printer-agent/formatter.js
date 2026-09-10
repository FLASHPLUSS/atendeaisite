const DEFAULT_COLUMNS = 42;

function line(value = '', columns = DEFAULT_COLUMNS) {
  return String(value).slice(0, columns);
}

function divider(columns = DEFAULT_COLUMNS) {
  return '-'.repeat(columns);
}

export function formatOrder(job, { columns = DEFAULT_COLUMNS } = {}) {
  const order = job.payload || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const output = [
    'ATENDEAI - PEDIDO',
    `Pedido: ${job.order_number}`,
    `Data: ${new Date(job.created_at || Date.now()).toLocaleString('pt-BR')}`,
    divider(columns),
  ];
  items.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    output.push(`${quantity}x ${line(item.name || 'Produto', columns)}`);
    output.push(`   R$ ${(quantity * price).toFixed(2).replace('.', ',')}`);
    if (item.notes) output.push(`   Obs: ${line(item.notes, columns)}`);
  });
  if (!items.length) output.push('Pedido de teste - sem itens');
  output.push(divider(columns));
  output.push(`Total: R$ ${Number(order.total || 0).toFixed(2).replace('.', ',')}`);
  if (order.customer) output.push(`Cliente: ${line(order.customer, columns)}`);
  if (order.notes) output.push(`Obs: ${line(order.notes, columns)}`);
  output.push('', 'Obrigado pela preferencia!', '', '');
  return output.join('\n');
}
