import { dashboardView } from '../css/js/views/dashboard.js';
import { pedidosView } from '../css/js/views/pedidos.js';
import { cardapioView } from '../css/js/views/cardapio.js';
import { lojaView } from '../css/js/views/loja.js';
import { configuracoesView } from '../css/js/views/configuracoes.js';
import { relatoriosView } from '../css/js/views/relatorios.js';
import { agenteIaView } from '../css/js/views/agente-ia.js';
import { connectWhatsApp, disconnectWhatsApp, getConnectionState } from '../css/js/services/evolution-api.js';
import { connectRealtime, createMenuItem, deleteMenuItem, getMenuItems, getPhysicalMenu, savePhysicalMenu, updateMenuItem, updateRestaurantSettings } from '../css/js/services/data-api.js';

const app = document.querySelector('#app');
const routes = { inicio: dashboardView, pedidos: pedidosView, loja: lojaView, cardapio: cardapioView, relatorios: relatoriosView, configuracoes: configuracoesView, 'agente-ia': agenteIaView };
let realtimeSocket;

function currentRoute() {
  return window.location.hash.replace('#', '') || 'inicio';
}

function setDrawer(open) {
  const drawer = document.querySelector('#drawer');
  const overlay = document.querySelector('#drawer-overlay');
  const openButton = document.querySelector('#open-drawer');
  if (!drawer || !overlay || !openButton) return;
  drawer.classList.toggle('is-open', open);
  overlay.classList.toggle('is-visible', open);
  openButton.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function bindView() {
  const drawer = document.querySelector('#drawer');
  const overlay = document.querySelector('#drawer-overlay');
  const openButton = document.querySelector('#open-drawer');
  const closeButton = document.querySelector('#close-drawer');
  const navLinks = document.querySelectorAll('.nav-item');

  openButton?.addEventListener('click', () => setDrawer(true));
  closeButton?.addEventListener('click', () => setDrawer(false));
  overlay?.addEventListener('click', () => setDrawer(false));
  navLinks.forEach((link) => link.addEventListener('click', () => {
    if (window.innerWidth <= 980) setDrawer(false);
  }));
  document.querySelectorAll('.nav-item[href="#clientes"]').forEach((link) => {
    link.href = '#agente-ia';
    link.querySelector('span').textContent = 'Agente de IA';
    const icon = link.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', 'bot');
      if (icon.tagName === 'svg') icon.outerHTML = '<i data-lucide="bot"></i>';
    }
  });
  lucide.createIcons();
  bindSettings();
  bindRestaurantMedia();
  hydrateRestaurantBrand();
  bindReports();
  bindAgent();
  clearDemoContent();
  bindCardapio();
  bindPhysicalMenu();
  if (!realtimeSocket && ['http:', 'https:'].includes(window.location.protocol)) realtimeSocket = connectRealtime((event) => {
    if (event.type.startsWith('menu.')) {
      const page = document.querySelector('.menu-page');
      if (page) { page.dataset.bound = 'false'; bindCardapio(); }
    }
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function emptyState(title, message) {
  return `<div class="empty-state"><i data-lucide="database-zap"></i><strong>${title}</strong><span>${message}</span></div>`;
}

function clearDemoContent() {
  const main = document.querySelector('.main-content');
  document.querySelectorAll('.nav-item b').forEach((element) => element.remove());
  document.querySelectorAll('.date-picker').forEach((element) => { element.textContent = 'Período'; });
  document.querySelectorAll('.menu-toolbar__meta > span').forEach((element) => { element.textContent = '0 itens ativos'; });
  document.querySelectorAll('.category-tab b').forEach((element) => element.remove());
  const welcome = main?.querySelector('.welcome-row');
  if (welcome) {
    welcome.querySelector('.eyebrow').textContent = 'Visão geral';
    welcome.querySelector('h1').textContent = 'Bem-vindo';
    welcome.querySelector('.subtitle').textContent = 'Os dados reais da sua operação aparecerão aqui.';
  }
  if (main?.id === 'inicio') {
    main.querySelector('.metric-grid').innerHTML = emptyState('Sem dados ainda', 'Os indicadores aparecerão quando houver registros no banco.');
    main.querySelector('.sales-panel .panel__header p').textContent = 'Aguardando os primeiros registros';
    main.querySelector('.sales-panel .chart').classList.add('chart--empty');
    main.querySelector('.sales-panel .chart__area').insertAdjacentHTML('beforeend', '<span class="chart-empty-label">Sem dados para plotar</span>');
    main.querySelector('.operations-panel').innerHTML = `<div class="panel__header"><div><h2>Operação hoje</h2><p>Aguardando dados da operação</p></div><span class="live-indicator"><i></i> Ao vivo</span></div>${emptyState('Sem movimentação', 'Os indicadores aparecerão assim que houver registros.')}`;
    main.querySelector('.orders-panel--wide').innerHTML = emptyState('Nenhum pedido', 'Os pedidos reais aparecerão aqui em tempo real.');
  }
  if (main?.id === 'pedidos') {
    main.querySelector('.order-summary').innerHTML = emptyState('Nenhum pedido registrado', 'Os pedidos do banco aparecerão nesta tela.');
    main.querySelector('.orders-table-panel').innerHTML = emptyState('Aguardando pedidos', 'Não existem pedidos reais para exibir.');
  }
  if (main?.id === 'relatorios') {
    main.querySelector('.report-metrics').innerHTML = emptyState('Sem dados para analisar', 'Os relatórios serão preenchidos com a operação real.');
    main.querySelector('.reports-grid').querySelectorAll('.panel').forEach((panel) => {
      panel.querySelectorAll('.report-bar-chart, .channel-report__body').forEach((chart) => chart.classList.add('chart--empty'));
      panel.querySelector('.channel-report__body')?.replaceChildren();
      panel.querySelector('.panel__header p').textContent = 'Aguardando os primeiros registros';
      panel.insertAdjacentHTML('beforeend', '<span class="chart-empty-label">Sem dados para plotar</span>');
    });
    main.querySelector('.dishes-report').innerHTML = emptyState('Sem pratos vendidos', 'O ranking será criado com pedidos reais.');
  }
  document.querySelectorAll('.profile strong').forEach((element) => { element.textContent = 'Usuário'; });
  document.querySelectorAll('.profile .avatar').forEach((element) => { element.textContent = 'U'; });
  document.querySelectorAll('.settings-form input').forEach((input) => { input.value = ''; });
  const assistantName = document.querySelector('#assistant-name');
  const assistantPrompt = document.querySelector('#assistant-prompt');
  if (assistantName) assistantName.value = '';
  if (assistantPrompt) assistantPrompt.value = '';
  lucide.createIcons();
}

function menuItemMarkup(item) {
  const initials = item.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const visual = item.image_data ? `<img src="${escapeHtml(item.image_data)}" alt="" />` : `<span>${escapeHtml(initials)}</span><i data-lucide="utensils"></i>`;
  return `<article class="menu-item${item.available ? '' : ' menu-item--paused'}" data-menu-item-id="${item.id}"><div class="menu-item__visual menu-item__visual--green">${visual}</div><div class="menu-item__body"><div class="menu-item__title"><h2>${escapeHtml(item.name)}</h2><button class="more-button" type="button" aria-label="Opções de ${escapeHtml(item.name)}" aria-expanded="false"><i data-lucide="more-horizontal"></i></button></div><p>${escapeHtml(item.description)}</p><div class="menu-item__footer"><strong>R$ ${Number(item.price).toFixed(2).replace('.', ',')}</strong><span class="availability${item.available ? '' : ' availability--paused'}"><i></i> ${item.available ? 'Disponível' : 'Indisponível'}</span></div></div><div class="menu-item-actions" hidden><button type="button" data-menu-action="edit"><i data-lucide="pencil"></i> Editar produto</button><button type="button" data-menu-action="toggle"><i data-lucide="${item.available ? 'pause-circle' : 'play-circle'}"></i> ${item.available ? 'Suspender produto' : 'Reativar produto'}</button><button type="button" class="menu-item-actions__danger" data-menu-action="delete"><i data-lucide="trash-2"></i> Excluir produto</button></div></article>`;
}

function bindCardapio() {
  const page = document.querySelector('.store-page');
  const grid = page?.querySelector('.menu-grid');
  if (!page || !grid || page.dataset.bound === 'true') return;
  page.dataset.bound = 'true';
  grid.innerHTML = emptyState('Nenhum item no cardápio', 'Adicione um prato para começar a montar seu cardápio.');
  getMenuItems().then(({ items }) => {
    window.menuItems = items;
    if (items.length) grid.innerHTML = items.map(menuItemMarkup).join('');
    page.querySelector('.menu-action')?.addEventListener('click', () => openMenuItemDialog(grid));
    bindMenuItemActions(grid);
    lucide.createIcons();
  }).catch(() => {
    page.querySelector('.menu-action')?.addEventListener('click', () => openMenuItemDialog(grid));
  });
}

function bindPhysicalMenu(refresh = false) {
  const page = document.querySelector('.physical-menu-page');
  if (!page || (page.dataset.bound === 'true' && !refresh)) return;
  page.dataset.bound = 'true';
  const status = page.querySelector('#physical-menu-status-text');
  const saveButton = page.querySelector('#save-physical-menu');
  const state = { snacksMenuImage: null, drinksMenuImage: null };

  const setStatus = (message, tone = '') => {
    status.textContent = message;
    status.closest('.physical-menu-status')?.classList.toggle('is-error', tone === 'error');
  };
  const renderSlot = (kind, dataUrl, filename = '') => {
    const card = page.querySelector(`[data-menu-kind="${kind}"]`);
    const input = card.querySelector('input[type="file"]');
    const empty = card.querySelector('.physical-upload__empty');
    const preview = card.querySelector('.physical-upload__preview');
    const image = card.querySelector('img');
    const name = card.querySelector('.physical-upload__filename');
    state[`${kind}MenuImage`] = dataUrl || null;
    if (dataUrl) {
      image.src = dataUrl;
      name.textContent = filename || 'Imagem salva no servidor';
      empty.hidden = true;
      preview.hidden = false;
      input.value = '';
    } else {
      image.removeAttribute('src');
      empty.hidden = false;
      preview.hidden = true;
      name.textContent = '';
    }
  };
  const readFile = (kind, file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setStatus('Use PNG, JPG ou WEBP.', 'error');
    if (file.size > 10 * 1024 * 1024) return setStatus('Cada imagem deve ter no máximo 10 MB.', 'error');
    const reader = new FileReader();
    reader.onload = () => { renderSlot(kind, reader.result, file.name); setStatus('Imagem pronta para salvar'); };
    reader.readAsDataURL(file);
  };
  page.querySelectorAll('.physical-menu-card').forEach((card) => {
    const kind = card.dataset.menuKind;
    const upload = card.querySelector('.physical-upload');
    const input = card.querySelector('input[type="file"]');
    input.addEventListener('change', () => readFile(kind, input.files[0]));
    ['dragenter', 'dragover'].forEach((eventName) => upload.addEventListener(eventName, (event) => { event.preventDefault(); upload.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((eventName) => upload.addEventListener(eventName, (event) => { event.preventDefault(); upload.classList.remove('is-dragging'); }));
    upload.addEventListener('drop', (event) => readFile(kind, event.dataTransfer.files[0]));
    card.querySelector('.physical-upload__remove').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); renderSlot(kind, null); setStatus('Imagem removida. Clique em salvar para confirmar.'); });
  });
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    setStatus('Salvando imagens...');
    try {
      const saved = await savePhysicalMenu(state);
      renderSlot('snacks', saved.snacksMenuImage);
      renderSlot('drinks', saved.drinksMenuImage);
      setStatus('Cardápio salvo no servidor');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      saveButton.disabled = false;
    }
  });
  getPhysicalMenu().then((menu) => {
    renderSlot('snacks', menu.snacksMenuImage);
    renderSlot('drinks', menu.drinksMenuImage);
  }).catch(() => setStatus('Não foi possível carregar o cardápio salvo.', 'error'));
  lucide.createIcons();
}

function bindMenuItemActions(grid) {
  grid.querySelectorAll('.menu-item').forEach((card) => {
    if (card.dataset.actionsBound === 'true') return;
    card.dataset.actionsBound = 'true';
    const actions = card.querySelector('.menu-item-actions');
    const toggle = card.querySelector('.more-button');
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      grid.querySelectorAll('.menu-item-actions').forEach((menu) => { if (menu !== actions) menu.hidden = true; });
      actions.hidden = !actions.hidden;
      toggle.setAttribute('aria-expanded', String(!actions.hidden));
    });
    actions.querySelector('[data-menu-action="edit"]').addEventListener('click', () => {
      const item = window.menuItems?.find((entry) => String(entry.id) === card.dataset.menuItemId);
      if (item) openMenuItemDialog(grid, item);
    });
    actions.querySelector('[data-menu-action="toggle"]').addEventListener('click', async () => {
      const item = window.menuItems?.find((entry) => String(entry.id) === card.dataset.menuItemId);
      if (!item) return;
      const updated = await updateMenuItem(item.id, { available: !item.available });
      window.menuItems = window.menuItems.map((entry) => entry.id === updated.id ? updated : entry);
      card.outerHTML = menuItemMarkup(updated);
      bindMenuItemActions(grid);
      lucide.createIcons();
    });
    actions.querySelector('[data-menu-action="delete"]').addEventListener('click', async () => {
      const item = window.menuItems?.find((entry) => String(entry.id) === card.dataset.menuItemId);
      if (!item || !window.confirm(`Excluir o produto "${item.name}"?`)) return;
      await deleteMenuItem(item.id);
      window.menuItems = window.menuItems.filter((entry) => entry.id !== item.id);
      card.remove();
      if (!grid.children.length) grid.innerHTML = emptyState('Nenhum item no cardápio', 'Adicione um prato para começar a montar seu cardápio.');
    });
  });
}

function openMenuItemDialog(grid, existingItem = null) {
  if (document.querySelector('#menu-item-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'menu-item-dialog';
  dialog.innerHTML = `<form method="dialog" class="menu-dialog-form"><div class="panel__header"><div><h2>${existingItem ? 'Editar produto' : 'Novo item do cardápio'}</h2><p>Salve os dados do produto diretamente no banco de dados.</p></div><button class="icon-button" value="cancel" aria-label="Fechar"><i data-lucide="x"></i></button></div><label>Nome do prato<input name="name" required maxlength="120" /></label><label>Descrição<textarea name="description" maxlength="500"></textarea></label><div class="menu-dialog-form__row"><label>Preço<input name="price" type="number" min="0" step="0.01" required /></label><label>Categoria<select name="category"><option>Entradas</option><option selected>Pratos principais</option><option>Bebidas</option><option>Sobremesas</option></select></label></div><label>Foto do prato<input name="image" type="file" accept="image/png,image/jpeg,image/webp" /></label><div class="menu-dialog-form__actions"><button class="filter-button" value="cancel">Cancelar</button><button class="menu-action" value="default">Salvar produto</button></div></form>`;
  document.body.append(dialog);
  lucide.createIcons();
  dialog.addEventListener('close', () => dialog.remove());
  if (existingItem) {
    dialog.querySelector('[name="name"]').value = existingItem.name;
    dialog.querySelector('[name="description"]').value = existingItem.description || '';
    dialog.querySelector('[name="price"]').value = existingItem.price;
    dialog.querySelector('[name="category"]').value = existingItem.category;
  }
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.image.files[0];
    const imageData = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : null;
    const payload = { name: form.name.value.trim(), description: form.description.value.trim(), price: form.price.value, category: form.category.value };
    if (imageData) payload.imageData = imageData;
    const item = existingItem ? await updateMenuItem(existingItem.id, payload) : await createMenuItem(payload);
    window.menuItems = existingItem ? window.menuItems.map((entry) => entry.id === item.id ? item : entry) : [item, ...(window.menuItems || [])];
    if (existingItem) document.querySelector(`[data-menu-item-id="${existingItem.id}"]`)?.replaceWith(document.createRange().createContextualFragment(menuItemMarkup(item)));
    else grid.insertAdjacentHTML('afterbegin', menuItemMarkup(item));
    bindMenuItemActions(grid);
    lucide.createIcons();
    dialog.close();
  });
  dialog.showModal();
}

function bindAgent() {
  const connectionCard = document.querySelector('#whatsapp-connection');
  if (!connectionCard) return;
  const qrPanel = document.querySelector('#qr-panel');
  const qrImage = document.querySelector('#whatsapp-qr');
  const connectButton = document.querySelector('#connect-whatsapp');
  const disconnectButton = document.querySelector('#disconnect-whatsapp');
  const demoButton = document.querySelector('#demo-connect');
  const status = document.querySelector('#connection-status');
  const title = document.querySelector('#connection-title');
  const description = document.querySelector('#connection-description');
  const nameInput = document.querySelector('#assistant-name');
  const promptInput = document.querySelector('#assistant-prompt');
  const configForm = document.querySelector('#agent-config-form');
  const automationToggle = document.querySelector('#automation-toggle');
  const automationState = document.querySelector('#automation-state');
  const automationDescription = document.querySelector('#automation-description');
  const restaurantConfig = JSON.parse(localStorage.getItem('atende-restaurant-config') || '{}');
  let statusTimer;
  let qrRequested = false;

  const paintConnection = (state) => {
    const connected = Boolean(state.connected);
    status.classList.toggle('is-connected', connected);
    status.classList.toggle('is-disconnected', !connected);
    const waiting = !connected && state.state === 'connecting';
    status.classList.toggle('is-connecting', waiting);
    const instanceReady = waiting && !qrRequested;
    status.innerHTML = connected ? '<i></i> Conectado' : instanceReady ? '<i></i> Instância criada' : waiting ? '<i></i> Aguardando pareamento' : '<i></i> Desconectado';
    title.textContent = connected ? 'WhatsApp conectado' : instanceReady ? 'WhatsApp pronto para conectar' : waiting ? 'Escaneie o QR Code para conectar' : 'WhatsApp não conectado';
    description.textContent = connected ? `Linha conectada: ${state.phone || '+55 11 99876-5432'}` : instanceReady ? 'A instância já existe. Clique em conectar para gerar o QR Code.' : waiting ? 'Abra o WhatsApp no celular e escaneie o código abaixo.' : 'Conecte uma linha para o atendente começar a conversar com seus clientes.';
    if (state.error) description.textContent = state.error;
    connectButton.hidden = connected;
    disconnectButton.hidden = !connected;
    if (!connected) connectButton.innerHTML = `<i data-lucide="qr-code"></i> ${qrRequested ? 'Regerar QR Code' : 'Conectar WhatsApp'}`;
    if (qrRequested && state.qrCode && !connected) {
      qrImage.src = state.qrCode;
      qrImage.style.width = '280px';
      qrImage.style.height = '280px';
      qrImage.style.display = 'block';
      qrPanel.hidden = false;
    }
    if (!qrRequested || connected) qrPanel.hidden = true;
    if (connected) window.clearInterval(statusTimer);
    lucide.createIcons();
  };

  const pollConnection = () => getConnectionState().then((state) => { paintConnection(state); return state; });
  pollConnection().then((state) => {
    if (!state.connected) statusTimer = window.setInterval(pollConnection, 3000);
  });
  connectButton.addEventListener('click', async () => {
    if (!restaurantConfig.name?.trim()) {
      title.textContent = 'Configure o restaurante primeiro';
      description.textContent = 'Acesse Configurações > Restaurante e salve o nome do restaurante para criar a instância WhatsApp.';
      return;
    }
    connectButton.disabled = true;
    qrRequested = true;
    connectButton.innerHTML = '<i data-lucide="loader-circle"></i> Gerando QR Code...';
    lucide.createIcons();
    const state = await connectWhatsApp();
    if (state.error) {
      title.textContent = 'Não foi possível conectar';
      description.textContent = state.error;
      connectButton.disabled = false;
      connectButton.innerHTML = '<i data-lucide="qr-code"></i> Tentar novamente';
      lucide.createIcons();
      return;
    }
    qrImage.src = state.qrCode;
    qrImage.style.width = '280px';
    qrImage.style.height = '280px';
    qrImage.style.display = 'block';
    qrPanel.hidden = false;
    connectButton.disabled = false;
    connectButton.innerHTML = '<i data-lucide="qr-code"></i> Regerar QR Code';
    lucide.createIcons();
  });
  demoButton?.remove();
  disconnectButton.addEventListener('click', async () => { qrRequested = false; paintConnection(await disconnectWhatsApp()); });
  configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    localStorage.setItem('atende-agent-config', JSON.stringify({ name: nameInput.value, prompt: promptInput.value }));
    updateRestaurantSettings({ agent: { name: nameInput.value, prompt: promptInput.value } }).catch((error) => console.warn(error.message));
    document.querySelector('#agent-save-status').textContent = 'Configurações salvas agora';
  });
  const savedConfig = JSON.parse(localStorage.getItem('atende-agent-config') || '{}');
  if (savedConfig.name) nameInput.value = savedConfig.name;
  if (savedConfig.prompt) promptInput.value = savedConfig.prompt;
  automationToggle.addEventListener('change', () => {
    automationState.classList.toggle('is-paused', !automationToggle.checked);
    automationState.innerHTML = automationToggle.checked ? '<i></i> Ativo e pronto para atender' : '<i></i> Pausado pelo administrador';
    automationDescription.textContent = automationToggle.checked ? 'O agente pode responder clientes automaticamente pelo WhatsApp conectado.' : 'As conversas continuam chegando, mas nenhuma resposta automática será enviada.';
  });
}

function bindReports() {
  const reportsPage = document.querySelector('.reports-page');
  if (!reportsPage) return;
  const periodButton = reportsPage.querySelector('[data-report-filter="period"]');
  const channelButton = reportsPage.querySelector('[data-report-filter="channel"]');
  const updatedLabel = reportsPage.querySelector('.report-updated');
  const periodOptions = ['Hoje', 'Esta semana', 'Este mês'];
  const channelOptions = ['Todos os canais', 'Salão', 'Delivery', 'Retirada'];
  let periodIndex = 1;
  let channelIndex = 0;

  periodButton?.addEventListener('click', () => {
    periodIndex = (periodIndex + 1) % periodOptions.length;
    periodButton.firstChild.textContent = `${periodOptions[periodIndex]} `;
    updatedLabel.innerHTML = '<i data-lucide="check"></i> Filtro aplicado agora';
    lucide.createIcons();
  });
  channelButton?.addEventListener('click', () => {
    channelIndex = (channelIndex + 1) % channelOptions.length;
    channelButton.firstChild.textContent = `${channelOptions[channelIndex]} `;
    reportsPage.querySelector('.channel-report__legend').classList.toggle('is-filtered', channelIndex > 0);
    updatedLabel.innerHTML = '<i data-lucide="check"></i> Filtro aplicado agora';
    lucide.createIcons();
  });

  const exportButton = reportsPage.querySelector('.export-button');
  exportButton?.addEventListener('click', () => {
    const csv = 'Indicador,Valor\nReceita total,"R$ 12.840,00"\nTotal de pedidos,284\nTicket medio,"R$ 45,21"\nClientes atendidos,192';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'relatorio-atendeai.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    updatedLabel.innerHTML = '<i data-lucide="check"></i> Relatório exportado';
    lucide.createIcons();
  });
}

function bindRestaurantMedia() {
  const profileForm = document.querySelector('.settings-default-sections .settings-form');
  if (!profileForm || document.querySelector('.brand-media-settings')) return;
  profileForm.insertAdjacentHTML('afterend', `<div class="brand-media-settings"><div class="media-settings__header"><div><h3>Logo do restaurante</h3><p>Essa imagem aparece no menu lateral da equipe.</p></div></div><div class="media-upload-grid"><label class="media-upload media-upload--logo"><span class="media-preview media-preview--logo" data-media-preview="logo"><i data-lucide="image-plus"></i></span><span><strong>Enviar logo</strong><small>PNG ou JPG · até 2 MB</small></span><input type="file" accept="image/png,image/jpeg" data-media-input="logo" /></label></div></div>`);
  lucide.createIcons();
  document.querySelectorAll('[data-media-input]').forEach((input) => input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      localStorage.setItem(`atende-${input.dataset.mediaInput}`, reader.result);
      updateRestaurantSettings({ logoData: reader.result }).catch((error) => console.warn(error.message));
      hydrateRestaurantBrand();
      updateMediaPreviews();
    });
    reader.readAsDataURL(file);
  }));
  updateMediaPreviews();
}

function updateMediaPreviews() {
  ['logo'].forEach((type) => {
    const preview = document.querySelector(`[data-media-preview="${type}"]`);
    const image = localStorage.getItem(`atende-${type}`);
    if (!preview || !image) return;
    preview.style.backgroundImage = `url("${image}")`;
    preview.classList.add('has-image');
    preview.querySelector('svg')?.remove();
  });
}

function getRestaurantName() {
  const restaurant = JSON.parse(localStorage.getItem('atende-restaurant-config') || '{}');
  return restaurant.name?.trim() || 'Seu restaurante';
}

function renderRestaurantTemplate(template) {
  const restaurantName = getRestaurantName();
  return template
    .replace(/Manjericão/g, restaurantName)
    .replace(/manjericao/g, restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, ''));
}

function hydrateRestaurantBrand() {
  const restaurantName = getRestaurantName();
  const brandNames = document.querySelectorAll('.workspace-switcher__copy strong');
  brandNames.forEach((element) => {
    element.textContent = restaurantName;
  });

  const avatars = document.querySelectorAll('.workspace-switcher .avatar');
  avatars.forEach((avatar) => {
    const initial = restaurantName.charAt(0)?.toUpperCase() || 'R';
    avatar.textContent = initial;
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-image');
  });

  const logo = localStorage.getItem('atende-logo');
  const drawerAvatar = document.querySelector('.workspace-switcher .avatar');
  if (logo && drawerAvatar) {
    drawerAvatar.textContent = '';
    drawerAvatar.style.backgroundImage = `url("${logo}")`;
    drawerAvatar.classList.add('has-image');
  }

  const subtitle = document.querySelector('.agent-intro .subtitle');
  if (subtitle) subtitle.textContent = `Conecte o WhatsApp e configure o atendente virtual do ${restaurantName}.`;

  const assistantNameInput = document.querySelector('#assistant-name');
  if (assistantNameInput && !assistantNameInput.dataset.userEdited) {
    assistantNameInput.value = `Atendente do ${restaurantName}`;
  }

  const settingsInput = document.querySelector('.settings-restaurant input[type="text"]');
  if (settingsInput && settingsInput.value.trim() === 'Manjericão') {
    settingsInput.value = restaurantName;
  }

  updateMediaPreviews();
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.dataset.theme = theme;
  localStorage.setItem('atende-theme', theme);
  updateRestaurantSettings({ theme }).catch(() => {});
}

function bindSettings() {
  const settingsPage = document.querySelector('.settings-page');
  if (!settingsPage) return;

  const sectionLinks = settingsPage.querySelectorAll('[data-settings-section]');
  const defaultSections = settingsPage.querySelector('.settings-default-sections');
  const restaurantSection = settingsPage.querySelector('.settings-restaurant');
  const notificationsSection = settingsPage.querySelector('.settings-notifications');
  const appearanceSection = settingsPage.querySelector('.settings-appearance');
  const themeOptions = settingsPage.querySelectorAll('[data-theme-choice]');
  const profileSection = settingsPage.querySelector('.settings-default-sections .settings-section');
  const profileSaveButton = profileSection?.querySelector('.settings-save');
  profileSaveButton?.addEventListener('click', () => {
    const inputs = profileSection.querySelectorAll('.settings-form input, .settings-form select');
    const profile = Object.fromEntries([...inputs].map((input) => [input.previousSibling?.textContent?.trim() || input.name || input.type, input.value]));
    updateRestaurantSettings({ profile }).then(() => {
      const feedback = profileSaveButton.closest('.settings-section__footer')?.querySelector('small');
      if (feedback) feedback.textContent = 'Dados salvos no banco agora';
    }).catch((error) => console.warn(error.message));
  });

  const restaurantForm = restaurantSection?.querySelector('.settings-form');
  const restaurantNameInput = restaurantSection?.querySelector('input[type="text"]');
  const restaurantSaveButton = restaurantSection?.querySelector('.settings-save');
  if (restaurantNameInput) {
    restaurantNameInput.required = true;
    const savedRestaurant = JSON.parse(localStorage.getItem('atende-restaurant-config') || '{}');
    if (savedRestaurant.name) restaurantNameInput.value = savedRestaurant.name;
    restaurantSaveButton?.addEventListener('click', () => {
      const name = restaurantNameInput.value.trim();
      if (!name) {
        restaurantNameInput.setCustomValidity('Informe o nome do restaurante.');
        restaurantNameInput.reportValidity();
        return;
      }
      restaurantNameInput.setCustomValidity('');
      localStorage.setItem('atende-restaurant-config', JSON.stringify({ ...savedRestaurant, name }));
      const fields = restaurantSection.querySelectorAll('.settings-form input');
      updateRestaurantSettings({ name, phone: fields[1]?.value, address: fields[2]?.value }).catch((error) => console.warn(error.message));
      hydrateRestaurantBrand();
      const feedback = restaurantSaveButton.closest('.settings-section__footer')?.querySelector('small');
      if (feedback) feedback.textContent = `Instância definida: ${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    });
  }
  restaurantSection?.addEventListener('click', (event) => {
    if (!event.target.closest('.settings-save')) return;
    const name = restaurantSection.querySelector('input[type="text"]')?.value.trim();
    if (!name) return;
    localStorage.setItem('atende-restaurant-config', JSON.stringify({ name }));
  });
  if (restaurantForm && !restaurantSection.querySelector('.opening-hours')) {
    [...restaurantForm.querySelectorAll('label')].find((label) => label.textContent.includes('Horário de funcionamento'))?.remove();
    restaurantForm.insertAdjacentHTML('afterend', `<div class="opening-hours"><div class="opening-hours__header"><div><h3>Horário de funcionamento</h3><p>Defina quando o restaurante recebe pedidos.</p></div><span><i></i> Horários locais</span></div><div class="schedule-list"><label class="schedule-row"><input type="checkbox" checked /><strong>Segunda-feira</strong><input type="time" value="11:00" /><span>até</span><input type="time" value="23:00" /></label><label class="schedule-row"><input type="checkbox" checked /><strong>Terça-feira</strong><input type="time" value="11:00" /><span>até</span><input type="time" value="23:00" /></label><label class="schedule-row"><input type="checkbox" checked /><strong>Quarta-feira</strong><input type="time" value="11:00" /><span>até</span><input type="time" value="23:00" /></label><label class="schedule-row"><input type="checkbox" checked /><strong>Quinta-feira</strong><input type="time" value="11:00" /><span>até</span><input type="time" value="23:00" /></label><label class="schedule-row"><input type="checkbox" checked /><strong>Sexta-feira</strong><input type="time" value="11:00" /><span>até</span><input type="time" value="00:00" /></label><label class="schedule-row"><input type="checkbox" checked /><strong>Sábado</strong><input type="time" value="11:30" /><span>até</span><input type="time" value="00:00" /></label><label class="schedule-row is-closed"><input type="checkbox" /><strong>Domingo</strong><input type="time" value="11:00" disabled /><span>até</span><input type="time" value="22:00" disabled /></label></div></div>`);
    restaurantSection.querySelectorAll('.schedule-row > input[type="checkbox"]').forEach((toggle) => toggle.addEventListener('change', () => {
      toggle.closest('.schedule-row').classList.toggle('is-closed', !toggle.checked);
      toggle.closest('.schedule-row').querySelectorAll('input[type="time"]').forEach((time) => { time.disabled = !toggle.checked; });
    }));
  }

  sectionLinks.forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    sectionLinks.forEach((item) => item.classList.remove('is-active'));
    link.classList.add('is-active');
    const selectedSection = link.dataset.settingsSection;
    defaultSections.hidden = selectedSection !== 'profile';
    restaurantSection.hidden = selectedSection !== 'restaurant';
    notificationsSection.hidden = selectedSection !== 'notifications';
    appearanceSection.hidden = selectedSection !== 'appearance';
  }));

  themeOptions.forEach((option) => option.addEventListener('click', () => {
    themeOptions.forEach((item) => item.classList.remove('is-selected'));
    option.classList.add('is-selected');
    applyTheme(option.dataset.themeChoice);
  }));

  const savedTheme = localStorage.getItem('atende-theme') || 'dark';
  applyTheme(savedTheme);
  themeOptions.forEach((option) => option.classList.toggle('is-selected', option.dataset.themeChoice === savedTheme));
}

function render() {
  app.innerHTML = '<div class="app-loading" role="status" aria-label="Carregando AtendeAI"><img src="assets/logo-atendeai.svg" alt="AtendeAI" /></div>';
  const route = currentRoute();
  const view = routes[route] || dashboardView;
  window.setTimeout(() => {
    app.innerHTML = renderRestaurantTemplate(view());
    bindView();
  }, 1200);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setDrawer(false);
});
window.addEventListener('hashchange', render);
render();
