export function configuracoesView() {
  return `
    <div class="app-shell">
      <aside class="drawer" id="drawer" aria-label="Navegação principal">
        <div class="drawer__top"><a class="brand" href="#inicio" aria-label="AtendeAI início"><img class="brand__logo" src="assets/logo-atendeai.svg" alt="AtendeAI" /></a><button class="icon-button drawer__close" id="close-drawer" type="button" aria-label="Fechar menu"><i data-lucide="x"></i></button></div>
        <nav class="nav-list"><p class="nav-list__label">Visão geral</p><a class="nav-item" href="#inicio"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a class="nav-item" href="#pedidos"><i data-lucide="shopping-bag"></i><span>Pedidos</span><b>12</b></a><a class="nav-item" href="#reservas"><i data-lucide="calendar-days"></i><span>Reservas</span></a><p class="nav-list__label nav-list__label--spaced">Operação</p><a class="nav-item" href="#loja"><i data-lucide="store"></i><span>Loja</span></a><a class="nav-item" href="#cardapio"><i data-lucide="utensils"></i><span>Cardápio</span></a><a class="nav-item" href="#clientes"><i data-lucide="users"></i><span>Clientes</span></a><a class="nav-item" href="#relatorios"><i data-lucide="chart-no-axes-combined"></i><span>Relatórios</span></a></nav>
        <div class="drawer__bottom"><a class="nav-item is-active" href="#configuracoes"><i data-lucide="settings-2"></i><span>Configurações</span></a><div class="help-card"><span class="help-card__icon"><i data-lucide="message-circle"></i></span><strong>Precisa de ajuda?</strong><small>Fale com nosso suporte</small><i class="help-card__arrow" data-lucide="arrow-up-right"></i></div><div class="profile"><span class="avatar avatar--orange">JS</span><span><strong>João Silva</strong><small>Administrador</small></span><i data-lucide="more-horizontal"></i></div></div>
      </aside>
      <div class="drawer-overlay" id="drawer-overlay"></div>
      <main class="main-content" id="configuracoes">
        <header class="topbar"><button class="icon-button menu-trigger" id="open-drawer" type="button" aria-label="Abrir menu" aria-controls="drawer" aria-expanded="false"><i data-lucide="menu"></i></button><div class="breadcrumb"><span>Conta</span><i data-lucide="chevron-right"></i><strong>Configurações</strong></div><button class="icon-button notification" type="button" aria-label="Notificações"><i data-lucide="bell"></i><span></span></button></header>
        <section class="content-wrap settings-page">
          <div class="settings-intro"><div><p class="eyebrow">Preferências do sistema</p><h1>Configurações</h1><p class="subtitle">Ajuste os dados do restaurante e a experiência da sua equipe.</p></div><span class="settings-saved"><i data-lucide="check"></i> Tudo sincronizado</span></div>
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="Seções das configurações"><a class="settings-nav__item is-active" data-settings-section="profile" href="#configuracoes"><i data-lucide="user-round"></i><span><strong>Perfil</strong><small>Seus dados pessoais</small></span></a><a class="settings-nav__item" data-settings-section="restaurant" href="#configuracoes"><i data-lucide="store"></i><span><strong>Restaurante</strong><small>Dados da operação</small></span></a><a class="settings-nav__item" data-settings-section="printer" href="#configuracoes"><i data-lucide="printer"></i><span><strong>Impressão</strong><small>Pedidos e impressora</small></span></a><a class="settings-nav__item" data-settings-section="notifications" href="#configuracoes"><i data-lucide="bell-ring"></i><span><strong>Notificações</strong><small>Alertas e avisos</small></span></a><a class="settings-nav__item" data-settings-section="appearance" href="#configuracoes"><i data-lucide="palette"></i><span><strong>Aparência</strong><small>Tema e visual</small></span></a></nav>
            <div class="settings-content">
              <div class="settings-default-sections"><section class="panel settings-section"><div class="settings-section__header"><div><h2>Perfil pessoal</h2><p>Essas informações aparecem para sua equipe.</p></div><span class="settings-avatar">JS</span></div><div class="settings-form"><label>Nome completo<input type="text" value="João Silva" /></label><label>E-mail de acesso<input type="email" value="joao@manjericao.com" /></label><label>Telefone<input type="tel" value="(11) 99876-5432" /></label><label>Cargo<select><option>Administrador</option><option>Gerente</option><option>Atendente</option></select></label></div><div class="settings-section__footer"><small>Última atualização hoje, às 09:42</small><button class="settings-save" type="button">Salvar alterações</button></div></section></div>
              <section class="panel settings-section settings-restaurant" hidden><div class="settings-section__header"><div><h2>Dados do restaurante</h2><p>Essas informações aparecem nos seus canais de atendimento.</p></div><span class="settings-avatar settings-avatar--lime"><i data-lucide="store"></i></span></div><div class="settings-form"><label>Nome do restaurante<input type="text" value="Manjericão" /></label><label>Telefone comercial<input type="tel" value="(11) 3456-7890" /></label><label>Endereço<input type="text" value="Rua das Flores, 120" /></label><label>Horário de funcionamento<select><option>11:00 às 23:00</option><option>12:00 às 00:00</option><option>Fechado hoje</option></select></label></div><div class="settings-section__footer"><small>Dados visíveis para os clientes</small><button class="settings-save" type="button">Salvar dados</button></div></section>
              <section class="panel settings-section settings-printer" hidden>
                <div class="settings-section__header"><div><h2>Impressão de pedidos</h2><p>O agente roda em segundo plano no computador do restaurante e envia para esta tela as impressoras ligadas na USB.</p></div><span class="settings-avatar settings-avatar--blue"><i data-lucide="printer"></i></span></div>
                <div class="printer-agent-status" id="printer-agent-status" data-state="loading"><i></i><span id="printer-agent-status-text">Procurando o agente instalado neste computador...</span></div>

                <section class="printer-card">
                  <header class="printer-card__head">
                    <span class="printer-card__icon"><i data-lucide="printer"></i></span>
                    <div class="printer-card__copy"><h3>Impressora conectada</h3><p id="printer-detected-hint">A lista abaixo vem do agente instalado no computador do restaurante.</p></div>
                    <button class="printer-ghost-button" id="printer-refresh-button" type="button"><i data-lucide="refresh-cw"></i> Atualizar</button>
                  </header>
                  <div class="printer-detected" id="printer-detected-list"><p class="printer-detected__empty">Nenhuma impressora recebida ainda. Ligue a impressora na USB e abra o AtendePrint neste computador.</p></div>
                </section>

                <section class="printer-card">
                  <header class="printer-card__head">
                    <span class="printer-card__icon"><i data-lucide="ruler"></i></span>
                    <div class="printer-card__copy"><h3>Tamanho do papel</h3><p>Escolha o modelo da bobina e, se quiser, limite a quantidade de linhas do cupom.</p></div>
                  </header>
                  <div class="printer-paper-presets" id="printer-paper-presets">
                    <button class="paper-preset" type="button" data-columns="32"><strong>58 mm</strong><small>32 colunas · bobina estreita</small></button>
                    <button class="paper-preset" type="button" data-columns="42"><strong>80 mm</strong><small>42 colunas · bobina padrão</small></button>
                  </div>
                  <div class="printer-fields">
                    <label>Largura (colunas)<input id="printer-columns" type="number" min="20" max="80" value="42" /><small>58 mm usa 32 · 80 mm usa 42</small></label>
                    <label>Altura (linhas)<input id="printer-max-lines" type="number" min="0" max="200" value="0" /><small>0 deixa o cupom do tamanho do pedido</small></label>
                    <label>Buscar pedidos a cada<input id="printer-poll" type="number" min="2" max="60" value="5" /><small>em segundos</small></label>
                  </div>
                </section>

                <section class="printer-card printer-card--designer">
                  <header class="printer-card__head">
                    <span class="printer-card__icon"><i data-lucide="receipt-text"></i></span>
                    <div class="printer-card__copy"><h3>Comprovante</h3><p>Monte o cupom linha por linha usando os marcadores. A pré-visualização mostra exatamente o que sai no papel.</p></div>
                  </header>
                  <div class="receipt-designer">
                    <div class="receipt-editor">
                      <div class="receipt-panel__bar">
                        <span class="receipt-panel__title"><i data-lucide="pencil-line"></i> Modelo do comprovante</span>
                        <span class="receipt-panel__meta" id="printer-layout-stats">—</span>
                        <button class="receipt-reset" id="printer-layout-reset" type="button" title="Voltar ao modelo de fábrica"><i data-lucide="rotate-ccw"></i> Padrão</button>
                      </div>
                      <div class="receipt-editor__field">
                        <div class="receipt-editor__gutter" id="printer-layout-gutter" aria-hidden="true">1</div>
                        <textarea id="printer-layout" rows="14" spellcheck="false" aria-label="Modelo do comprovante"></textarea>
                      </div>
                      <div class="receipt-tokens" id="printer-tokens"></div>
                    </div>
                    <div class="receipt-preview">
                      <div class="receipt-panel__bar">
                        <span class="receipt-panel__title"><i data-lucide="eye"></i> Pré-visualização</span>
                        <span class="receipt-panel__meta" id="printer-preview-size">80 mm · 42 colunas</span>
                      </div>
                      <div class="receipt-preview__stage" id="printer-preview-stage">
                        <div class="receipt-preview__paper"><pre id="printer-layout-preview"></pre></div>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="printer-card printer-card--advanced">
                  <details class="printer-advanced">
                    <summary><span class="printer-advanced__label"><i data-lucide="sliders-horizontal"></i> Ajustes avançados</span><small>Conexão, porta e modo de teste</small></summary>
                    <div class="settings-form printer-settings-form"><label>Modo de impressão<select id="printer-mode"><option value="virtual">Virtual (teste sem impressora)</option><option value="usb">USB / Windows (impressora instalada no PC)</option><option value="escpos">ESC/POS por rede</option></select></label><label class="printer-settings-name">Nome da impressora no Windows<input id="printer-name" type="text" placeholder="Ex.: Elgin i9" /></label><label class="printer-settings-host">IP ou hostname da impressora<input id="printer-host" type="text" placeholder="Ex.: 192.168.1.50" /></label><label>Porta da impressora<input id="printer-port" type="number" min="1" max="65535" value="9100" /></label></div>
                  </details>
                </section>

                <div class="settings-section__footer"><small id="printer-save-feedback">A impressora em uso é enviada pelo agente a cada poucos segundos.</small><div class="printer-actions"><button class="printer-ghost-button" id="printer-test-button" type="button"><i data-lucide="send"></i> Criar pedido de teste</button><button class="settings-save" id="printer-save-button" type="button"><i data-lucide="check"></i> Salvar configuração</button></div></div>
              </section>
              <section class="panel settings-section settings-notifications" hidden><div class="settings-section__header"><div><h2>Notificações</h2><p>Escolha quais alertas sua equipe deve receber.</p></div><span class="settings-avatar settings-avatar--blue"><i data-lucide="bell-ring"></i></span></div><div class="settings-options"><label class="toggle-option"><span><strong>Novos pedidos</strong><small>Avise a equipe assim que um pedido chegar.</small></span><input type="checkbox" checked /><i></i></label><label class="toggle-option"><span><strong>Pedidos atrasados</strong><small>Notifique quando o tempo estimado for ultrapassado.</small></span><input type="checkbox" checked /><i></i></label><label class="toggle-option"><span><strong>Resumo diário</strong><small>Receba o fechamento da operação no fim do dia.</small></span><input type="checkbox" /><i></i></label><label class="toggle-option"><span><strong>Atualizações do AtendeAI</strong><small>Receba novidades e melhorias do sistema.</small></span><input type="checkbox" /><i></i></label></div></section>
              <section class="panel settings-section settings-appearance" hidden><div class="settings-section__header"><div><h2>Tema e visual</h2><p>Escolha como o AtendeAI aparece para você.</p></div><span class="settings-appearance__preview"><i data-lucide="moon"></i></span></div><div class="theme-options"><button class="theme-option is-selected" type="button" data-theme-choice="dark"><span class="theme-preview theme-preview--dark"><i></i><i></i><i></i></span><strong>Dark</strong><small>Ideal para operação</small></button><button class="theme-option" type="button" data-theme-choice="light"><span class="theme-preview theme-preview--light"><i></i><i></i><i></i></span><strong>Claro</strong><small>Mais luminoso</small></button><button class="theme-option" type="button" data-theme-choice="system"><span class="theme-preview theme-preview--system"><i></i><i></i><i></i></span><strong>Sistema</strong><small>Segue seu dispositivo</small></button></div></section>
            </div>
          </div>
        </section>
      </main>
    </div>`;
}
