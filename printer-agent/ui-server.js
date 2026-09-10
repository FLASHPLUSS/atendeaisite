import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

// A interface grafica roda dentro do proprio agente: um servidor HTTP que escuta
// SOMENTE em 127.0.0.1 (ninguem na rede consegue abrir) e uma janela do navegador
// em modo "app" (sem barra de enderecos), para parecer um programa nativo.
//
// O dominio do painel nunca aparece na tela: o estado exposto ja vem mascarado
// pelo agent.js, e esta pagina nao tem nenhum endereco externo (sem CDN, sem
// fonte de fora), por isso funciona ate sem internet.

const LOGO_SVG = `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3ef07a"/><stop offset="1" stop-color="#12a94f"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#0d1512" stroke="url(#lg)" stroke-width="2.5"/>
  <path d="M14 40h36v6a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#1c2b25"/>
  <rect x="19" y="16" width="26" height="16" rx="3" fill="url(#lg)" opacity="0.9"/>
  <rect x="23" y="44" width="18" height="9" rx="2" fill="#e9fff2"/>
  <circle cx="39" cy="23" r="2" fill="#0d1512"/><circle cx="45" cy="23" r="2" fill="#0d1512"/>
</svg>`;

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(LOGO_SVG);

function pageHtml(token) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AtendePrint</title>
<link rel="icon" href="${FAVICON}">
<style>
  :root {
    --bg: #070b09;
    --panel: #0f1613;
    --panel-2: #131d18;
    --border: #1e2b25;
    --border-soft: #17211c;
    --text: #e8f5ee;
    --muted: #7f978b;
    --accent: #3ef07a;
    --accent-dim: #1c8f4c;
    --danger: #ff5d5d;
    --warn: #ffb020;
    --info: #59b6ff;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: radial-gradient(1200px 700px at 15% -10%, #0f231a 0%, var(--bg) 55%) fixed;
    color: var(--text);
    font: 14px/1.5 "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    overflow: hidden;
  }
  .app { display: flex; flex-direction: column; height: 100vh; }

  header {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 20px; border-bottom: 1px solid var(--border);
    background: rgba(10,16,13,.72); backdrop-filter: blur(8px);
  }
  .brand { display: flex; align-items: center; gap: 11px; }
  .brand h1 { margin: 0; font-size: 17px; letter-spacing: .2px; }
  .brand span { display: block; font-size: 11px; color: var(--muted); font-weight: 400; letter-spacing: .4px; text-transform: uppercase; }
  .grow { flex: 1; }

  .pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--border); background: var(--panel);
  }
  .pill.ok { border-color: #1d5033; background: #0f2418; color: var(--accent); }
  .pill.bad { border-color: #4d2222; background: #21100f; color: var(--danger); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .pill.ok .dot { box-shadow: 0 0 0 0 rgba(62,240,122,.7); animation: ping 1.8s infinite; }
  @keyframes ping { 70% { box-shadow: 0 0 0 7px rgba(62,240,122,0); } 100% { box-shadow: 0 0 0 0 rgba(62,240,122,0); } }
  .pill.secret { color: var(--muted); }
  .pill.secret b { color: #adc4b8; letter-spacing: 2px; }

  main { flex: 1; display: grid; grid-template-columns: 1fr 372px; gap: 16px; padding: 16px 20px; overflow: hidden; }
  .col { display: flex; flex-direction: column; gap: 16px; min-height: 0; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 13px 15px; }
  .stat .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .7px; }
  .stat .v { font-size: 25px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .stat .v.small { font-size: 15px; padding-top: 8px; }
  .stat.hl { border-color: #1d5033; background: linear-gradient(180deg,#0f2418,#0f1613); }

  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .card > h2 {
    margin: 0; padding: 13px 16px; font-size: 13px; text-transform: uppercase; letter-spacing: .8px;
    color: #a9c2b6; border-bottom: 1px solid var(--border-soft);
    display: flex; align-items: center; gap: 9px;
  }
  .card > h2 .count { margin-left: auto; font-size: 11px; color: var(--muted); background: var(--panel-2); border: 1px solid var(--border); padding: 2px 9px; border-radius: 999px; letter-spacing: 0; text-transform: none; }
  .scroll { overflow: auto; padding: 8px; flex: 1; min-height: 0; }
  .scroll::-webkit-scrollbar { width: 9px; }
  .scroll::-webkit-scrollbar-thumb { background: #23332b; border-radius: 9px; }

  .live {
    display: flex; align-items: center; gap: 13px; padding: 13px 16px;
    border-bottom: 1px solid var(--border-soft);
    background: linear-gradient(90deg, rgba(62,240,122,.10), transparent 70%);
  }
  .live .ring { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #1d5033; border-top-color: var(--accent); animation: spin .8s linear infinite; flex: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .live .t { font-weight: 700; }
  .live .s { font-size: 12px; color: var(--muted); }
  .live.idle .ring { animation: none; border-color: #223029; border-top-color: #2c3f35; }
  .live.idle { background: none; }

  .row { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 11px; border: 1px solid transparent; }
  .row:hover { background: var(--panel-2); }
  .row + .row { margin-top: 3px; }
  .row .tag { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; letter-spacing: .5px; white-space: nowrap; }
  .tag.pending { background: #2a2008; color: var(--warn); border: 1px solid #4a3a12; }
  .tag.printing { background: #0f2418; color: var(--accent); border: 1px solid #1d5033; }
  .tag.printed { background: #0d1f2c; color: var(--info); border: 1px solid #1b3d55; }
  .tag.failed { background: #2a1211; color: var(--danger); border: 1px solid #4d2222; }
  .row .id { font-weight: 700; font-variant-numeric: tabular-nums; }
  .row .meta { font-size: 12px; color: var(--muted); }
  .row .right { margin-left: auto; text-align: right; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .row .total { font-weight: 700; color: #cfe9dc; font-variant-numeric: tabular-nums; }
  .items { font-size: 12px; color: #9db5a9; margin-top: 2px; }

  .printer { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 11px; border: 1px solid transparent; cursor: default; }
  .printer:hover { background: var(--panel-2); }
  .printer.active { background: #0f2418; border-color: #1d5033; }
  .printer .ico { width: 30px; height: 30px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--border); display: grid; place-items: center; flex: none; }
  .printer.active .ico { background: #13301f; border-color: #1d5033; }
  .printer .nm { font-weight: 600; font-size: 13px; word-break: break-word; }
  .printer .sub { font-size: 11px; color: var(--muted); }
  .printer .use { margin-left: auto; flex: none; }

  button {
    font: inherit; font-weight: 600; font-size: 12px; cursor: pointer;
    background: var(--panel-2); color: var(--text); border: 1px solid var(--border);
    padding: 7px 13px; border-radius: 9px; transition: .15s;
  }
  button:hover:not(:disabled) { border-color: #2e4a3c; background: #17241e; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { background: linear-gradient(180deg,#2bd96b,#17a24e); border-color: #1d8f4b; color: #04170b; }
  button.primary:hover:not(:disabled) { filter: brightness(1.08); }
  button.ghost { background: transparent; }
  button.block { width: 100%; }

  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 8px 13px; font-size: 13px; }
  .kv + .kv { border-top: 1px solid var(--border-soft); }
  .kv .k { color: var(--muted); }
  .kv .v { font-weight: 600; text-align: right; }
  .kv .v.mask { letter-spacing: 3px; color: #5d7268; }

  .actions { padding: 12px; display: flex; flex-direction: column; gap: 8px; }

  .empty { padding: 26px 16px; text-align: center; color: var(--muted); font-size: 13px; }
  .empty svg { opacity: .35; margin-bottom: 8px; }

  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translate(-50%, 24px);
    background: var(--panel-2); border: 1px solid var(--border); border-left: 3px solid var(--accent);
    padding: 11px 17px; border-radius: 11px; font-size: 13px; font-weight: 600;
    box-shadow: 0 12px 34px rgba(0,0,0,.55); opacity: 0; pointer-events: none; transition: .25s; z-index: 50;
  }
  .toast.show { opacity: 1; transform: translate(-50%, 0); }
  .toast.bad { border-left-color: var(--danger); }

  .skeleton { height: 44px; border-radius: 11px; margin: 4px 6px; background: linear-gradient(90deg,#131d18,#1a2820,#131d18); background-size: 200% 100%; animation: sk 1.2s infinite; }
  @keyframes sk { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

  @media (max-width: 1050px) { main { grid-template-columns: 1fr; overflow: auto; } .app { height: auto; } body { overflow: auto; } }
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="brand">
      ${LOGO_SVG}
      <div>
        <h1>AtendePrint</h1>
        <span>Agente de Impressao</span>
      </div>
    </div>
    <div class="grow"></div>
    <div id="conn" class="pill bad"><span class="dot"></span><span id="connText">conectando...</span></div>
    <div class="pill secret" title="O endereco do painel fica oculto por seguranca">Servidor <b>&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;</b></div>
  </header>

  <main>
    <div class="col">
      <div class="stats">
        <div class="stat hl">
          <div class="k" id="stPrinterLabel">Impressora ativa</div>
          <div class="v small" id="stPrinter">-</div>
        </div>
        <div class="stat">
          <div class="k">Impressos hoje</div>
          <div class="v" id="stPrinted">0</div>
        </div>
        <div class="stat">
          <div class="k">Na fila agora</div>
          <div class="v" id="stQueue">0</div>
        </div>
        <div class="stat">
          <div class="k">Falhas hoje</div>
          <div class="v" id="stFailed">0</div>
        </div>
      </div>

      <div class="card" style="flex:0 0 auto">
        <div id="live" class="live idle">
          <div class="ring"></div>
          <div>
            <div class="t" id="liveTitle">Aguardando pedidos</div>
            <div class="s" id="liveSub">Supervisionando a fila de impressao</div>
          </div>
        </div>
      </div>

      <div class="card" style="flex:1">
        <h2>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
          Fila de espera
          <span class="count" id="queueCount">0 pedidos</span>
        </h2>
        <div class="scroll" id="queue"></div>
      </div>

      <div class="card" style="flex:1">
        <h2>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Impressao em tempo real
          <span class="count" id="logCount">0 eventos</span>
        </h2>
        <div class="scroll" id="log"></div>
      </div>
    </div>

    <div class="col">
      <div class="card" style="flex:1">
        <h2>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/></svg>
          Impressoras disponiveis agora
          <button id="btnRefresh" class="ghost" style="margin-left:auto;padding:3px 10px;font-size:11px">Atualizar</button>
        </h2>
        <div class="scroll" id="printers"></div>
      </div>

      <div class="card" style="flex:0 0 auto">
        <h2>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
          Configuracao
        </h2>
        <div>
          <div class="kv"><span class="k">Modo de impressao</span><span class="v" id="cfgMode">-</span></div>
          <div class="kv"><span class="k">Largura do cupom</span><span class="v" id="cfgCols">-</span></div>
          <div class="kv"><span class="k">Busca de pedidos</span><span class="v" id="cfgPoll">-</span></div>
          <div class="kv"><span class="k">Endereco do painel</span><span class="v mask">&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;</span></div>
        </div>
        <div class="actions">
          <button id="btnTest" class="primary block">Imprimir cupom de teste</button>
        </div>
      </div>
    </div>
  </main>
</div>
<div id="toast" class="toast"></div>

<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var Q = '?k=' + encodeURIComponent(TOKEN);
  var lastLogId = null;
  var source = null;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function brl(v) {
    var n = Number(v || 0);
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }
  function hora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function toast(msg, bad) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function post(url, body) {
    return fetch(url + Q, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function itemsLine(job) {
    var p = job.payload || {};
    var list = Array.isArray(p.items) ? p.items : [];
    if (!list.length) return '';
    return list.slice(0, 4).map(function (i) {
      return (i.quantity || 1) + 'x ' + (i.name || 'Item');
    }).join(' &middot; ') + (list.length > 4 ? ' &hellip; +' + (list.length - 4) : '');
  }

  function renderQueue(state) {
    var box = el('queue');
    var jobs = state.queue || [];
    el('queueCount').textContent = jobs.length + (jobs.length === 1 ? ' pedido' : ' pedidos');
    if (!jobs.length) {
      box.innerHTML = '<div class="empty">Nenhum pedido aguardando.<br>Assim que um pedido cair na fila ele aparece aqui.</div>';
      return;
    }
    box.innerHTML = jobs.map(function (j) {
      var p = j.payload || {};
      var nItens = Array.isArray(p.items) ? p.items.length : 0;
      return '<div class="row">' +
        '<span class="tag pending">AGUARDANDO</span>' +
        '<div>' +
          '<div class="id">#' + esc(j.order_number) + '</div>' +
          '<div class="items">' + (itemsLine(j) || 'sem itens') + '</div>' +
        '</div>' +
        '<div class="right">' +
          '<div class="total">' + brl(p.total) + '</div>' +
          '<div>' + nItens + (nItens === 1 ? ' item' : ' itens') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderLog(state) {
    var box = el('log');
    var log = (state.activity || []).slice().reverse();
    el('logCount').textContent = log.length + ' eventos';
    if (!log.length) {
      box.innerHTML = '<div class="empty">O historico de impressao aparece aqui em tempo real.</div>';
      return;
    }
    box.innerHTML = log.map(function (a) {
      var cls = a.type === 'printed' ? 'printed' : (a.type === 'printing' ? 'printing' : (a.type === 'failed' ? 'failed' : 'pending'));
      var label = a.type === 'printed' ? 'IMPRESSO' : (a.type === 'printing' ? 'IMPRIMINDO' : (a.type === 'failed' ? 'FALHOU' : 'INFO'));
      return '<div class="row">' +
        '<span class="tag ' + cls + '">' + label + '</span>' +
        '<div>' +
          '<div class="id">' + (a.orderNumber ? '#' + esc(a.orderNumber) : 'Sistema') + '</div>' +
          '<div class="meta">' + esc(a.message) + '</div>' +
        '</div>' +
        '<div class="right">' + hora(a.at) + '</div>' +
      '</div>';
    }).join('');
  }

  function renderPrinters(state) {
    var box = el('printers');
    var info = state.printers || {};
    if (info.loading && !(info.list || []).length) {
      box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      return;
    }
    if (info.error) {
      box.innerHTML = '<div class="empty" style="color:#ffb020">' + esc(info.error) + '</div>';
      return;
    }
    var list = info.list || [];
    if (!list.length) {
      box.innerHTML = '<div class="empty">Nenhuma impressora encontrada neste Windows.<br>Confira se ela esta ligada e instalada.</div>';
      return;
    }
    var ativa = state.printerName || '';
    box.innerHTML = list.map(function (name) {
      var isActive = name === ativa;
      return '<div class="printer' + (isActive ? ' active' : '') + '">' +
        '<div class="ico">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' + (isActive ? '#3ef07a' : '#7f978b') + '" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/></svg>' +
        '</div>' +
        '<div>' +
          '<div class="nm">' + esc(name) + '</div>' +
          '<div class="sub">' + (isActive ? 'Em uso pelo agente' : 'Disponivel') + '</div>' +
        '</div>' +
        (isActive
          ? '<span class="tag printing use">ATIVA</span>'
          : '<button class="use" data-printer="' + esc(name) + '">Usar</button>') +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button[data-printer]'), function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        post('/api/printer', { name: b.getAttribute('data-printer') }).then(function (r) {
          toast(r.ok ? 'Impressora alterada para ' + b.getAttribute('data-printer') : (r.error || 'Nao foi possivel alterar'), !r.ok);
          if (!r.ok) b.disabled = false;
        });
      });
    });
  }

  function renderLive(state) {
    var live = el('live');
    var job = state.printingJob;
    if (job) {
      live.className = 'live';
      el('liveTitle').textContent = 'Imprimindo pedido #' + (job.order_number || '');
      el('liveSub').textContent = itemsLine(job).replace(/&middot;/g, '-').replace(/&hellip;/g, '...').replace(/&amp;/g, '&') || 'Enviando para a impressora';
    } else {
      live.className = 'live idle';
      el('liveTitle').textContent = state.connected ? 'Aguardando pedidos' : 'Sem conexao com o painel';
      el('liveSub').textContent = state.connected
        ? 'Supervisionando a fila a cada ' + Math.round((state.pollMs || 5000) / 1000) + 's'
        : (state.lastError || 'Verifique a internet deste computador');
    }
  }

  function render(state) {
    var destino = state.mode === 'usb'
      ? (state.printerName || 'nao definida')
      : (state.mode === 'escpos' ? 'Rede' : 'Arquivo de teste');
    el('stPrinterLabel').textContent = state.mode === 'usb' ? 'Impressora ativa' : 'Destino dos cupons';
    el('stPrinter').textContent = destino;
    el('stPrinted').textContent = state.counters.printed;
    el('stQueue').textContent = (state.queue || []).length;
    el('stFailed').textContent = state.counters.failed;

    var pill = el('conn');
    pill.className = 'pill ' + (state.connected ? 'ok' : 'bad');
    el('connText').textContent = state.connected ? 'Painel conectado' : 'Painel indisponivel';

    el('cfgMode').textContent = state.mode === 'usb' ? 'USB / Windows' : (state.mode === 'escpos' ? 'Rede (ESC/POS)' : 'Teste (arquivo)');
    el('cfgCols').textContent = state.columns + ' colunas';
    el('cfgPoll').textContent = Math.round((state.pollMs || 0) / 1000) + ' segundos';
    el('btnTest').disabled = !(state.mode !== 'usb' || state.printerName);

    renderLive(state);
    renderQueue(state);
    renderLog(state);
    renderPrinters(state);
  }

  el('btnRefresh').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    b.textContent = 'Buscando...';
    post('/api/printers/refresh').then(function () {
      setTimeout(function () { b.disabled = false; b.textContent = 'Atualizar'; }, 1200);
    });
  });

  el('btnTest').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    b.textContent = 'Enviando...';
    post('/api/test').then(function (r) {
      toast(r.ok ? 'Cupom de teste enviado' : (r.error || 'Falha no teste'), !r.ok);
      b.disabled = false;
      b.textContent = 'Imprimir cupom de teste';
    });
  });

  function connect() {
    fetch('/api/state' + Q).then(function (r) { return r.json(); }).then(render).catch(function () {});
    if (source) source.close();
    source = new EventSource('/api/events' + Q);
    source.onmessage = function (e) {
      try { render(JSON.parse(e.data)); } catch (err) { /* ignora pacote ruim */ }
    };
    source.onerror = function () {
      el('conn').className = 'pill bad';
      el('connText').textContent = 'Reconectando...';
    };
  }

  connect();
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) { e.preventDefault(); connect(); }
  });
})();
</script>
</body>
</html>`;
}

function pickPort(port) {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.once('error', () => resolve(null));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

export async function choosePort(preferred = 8787) {
  for (let port = preferred; port < preferred + 20; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await pickPort(port)) return port;
  }
  return preferred;
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; if (raw.length > 1e6) request.destroy(); });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

// Tenta abrir a janela como um aplicativo (sem barra de enderecos). O Edge ja vem
// instalado em qualquer Windows 10/11, entao ele e a primeira opcao.
function findAppBrowser() {
  const candidates = [
    `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || '';
}

export function openAppWindow(url) {
  const browser = findAppBrowser();
  if (browser) {
    const child = spawn(browser, [
      `--app=${url}`,
      '--window-size=1180,840',
      '--window-position=60,40',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,msEdgeIdentityDefault',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  }
  // Sem Edge/Chrome: abre no navegador padrao (com barra de enderecos).
  const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return false;
}

export function createUiServer({ getState, actions, port }) {
  const token = crypto.randomBytes(16).toString('hex');
  const clients = new Set();

  function push() {
    if (!clients.size) return;
    const payload = `data: ${JSON.stringify(getState())}\n\n`;
    for (const client of clients) client.write(payload);
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    // O token impede que outra pagina/aplicativo local manipule o agente.
    if (url.searchParams.get('k') !== token) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Acesso negado.');
    }

    const json = (code, data) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };

    if (url.pathname === '/' || url.pathname === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(pageHtml(token));
    }

    if (url.pathname === '/api/state') return json(200, getState());

    if (url.pathname === '/api/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
      });
      response.write(': conectado\n\n');
      response.write(`data: ${JSON.stringify(getState())}\n\n`);
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return undefined;
    }

    if (url.pathname === '/api/printers/refresh' && request.method === 'POST') {
      const result = await actions.refreshPrinters().catch((error) => ({ ok: false, error: error.message }));
      push();
      return json(200, result);
    }

    if (url.pathname === '/api/printer' && request.method === 'POST') {
      const body = await readBody(request);
      const result = await actions.setPrinter(body.name).catch((error) => ({ ok: false, error: error.message }));
      push();
      return json(200, result);
    }

    if (url.pathname === '/api/test' && request.method === 'POST') {
      const result = await actions.testPrint().catch((error) => ({ ok: false, error: error.message }));
      push();
      return json(200, result);
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Nao encontrado.');
  });

  // Sem isso a janela poderia ficar presa esperando o servidor responder.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({
      port,
      url: `http://127.0.0.1:${port}/?k=${token}`,
      token,
      push,
      close: () => {
        for (const client of clients) client.end();
        clients.clear();
        server.close();
      },
    }));
  });
}
