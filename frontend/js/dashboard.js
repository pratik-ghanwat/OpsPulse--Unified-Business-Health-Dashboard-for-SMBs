// ═══════════════════════════════════════
//  OPSPULSE — DASHBOARD MAIN
// ═══════════════════════════════════════

// ── DOM REFERENCES ──
const $ = id => document.getElementById(id);

// ── INITIALIZATION ──
document.addEventListener('DOMContentLoaded', () => {
  setupBizBadge();
  initAllCharts();
  startSimulation();
  updateAll();
});

function setupBizBadge() {
  $('bizBadgeIcon').textContent = AppState.bizIcon;
  $('bizBadgeName').textContent = AppState.bizName;
}

// ══════════════════════════════════════
//  SIMULATION ENGINE
//  Connects to your Node.js backend.
//  Replace the mock below with real API.
// ══════════════════════════════════════

let simInterval = null;
let simTick = 0;

/**
 * START SIMULATION
 * 
 * HOW TO INTEGRATE WITH BACKEND:
 * Replace fetchNextEvent() with a real call:
 *   const event = await fetch('/api/next-event').then(r => r.json());
 * Or connect to a WebSocket:
 *   const ws = new WebSocket('ws://localhost:3000/stream');
 *   ws.onmessage = e => processEvent(JSON.parse(e.data));
 */
function startSimulation() {
  AppState.simulationRunning = true;
  simInterval = setInterval(async () => {
    if (AppState.paused) return;
    const event = await fetchNextEvent();
    if (event) processEvent(event);
  }, 2500);
}

/**
 * MOCK EVENT GENERATOR
 * This simulates what your backend will send.
 * REMOVE this and replace with real API calls.
 */
async function fetchNextEvent() {
  simTick++;

  // ── THIS SECTION IS MOCK DATA ──
  // Replace with: return fetch('/api/simulation/next').then(r => r.json());

  const bizProducts = {
    retail:     ['Shoes', 'Bag', 'Shirt', 'Jacket', 'Hat', 'Belt', 'Socks'],
    ecommerce:  ['Phone Case', 'Earbuds', 'Charger', 'Laptop Stand', 'Mouse', 'Keyboard'],
    restaurant: ['Burger', 'Pizza', 'Pasta', 'Salad', 'Coffee', 'Juice', 'Dessert'],
  };
  const bizIssues = {
    retail:     ['Wrong size', 'Delivery delay', 'Damaged item', 'Return request', 'Exchange'],
    ecommerce:  ['Package lost', 'Wrong item', 'Return request', 'Payment issue', 'Delivery delay'],
    restaurant: ['Cold food', 'Wrong order', 'Long wait', 'Missing item', 'Hygiene complaint'],
  };

  const products = bizProducts[AppState.bizType] || bizProducts.retail;
  const issues   = bizIssues[AppState.bizType] || bizIssues.retail;

  // Simulate time advancement
  const baseMinutes = 10 * 60 + simTick * 2;
  const h = Math.floor(baseMinutes / 60) % 24;
  const m = baseMinutes % 60;
  AppState.simTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

  // Generate random event type
  const rand = Math.random();
  if (rand < 0.55) {
    // SALE EVENT
    return {
      type:    'sale',
      product: products[Math.floor(Math.random() * products.length)],
      amount:  Math.floor(Math.random() * 3500) + 300,
      time:    AppState.simTime,
    };
  } else if (rand < 0.75) {
    // INVENTORY UPDATE
    const product = products[Math.floor(Math.random() * products.length)];
    const change  = Math.random() > 0.3 ? -1 : -Math.floor(Math.random() * 4 + 1);
    return {
      type:    'inventory',
      product,
      change,
      time:    AppState.simTime,
    };
  } else {
    // SUPPORT TICKET
    const statuses = ['Open', 'Open', 'Open', 'Closed', 'Pending'];
    return {
      type:   'ticket',
      id:     1000 + simTick,
      issue:  issues[Math.floor(Math.random() * issues.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      time:   AppState.simTime,
    };
  }
}

/**
 * PROCESS INCOMING EVENT
 * This function handles events from backend or mock generator.
 */
function processEvent(event) {
  switch (event.type) {
    case 'sale':
      processSaleEvent(event);
      break;
    case 'inventory':
      processInventoryEvent(event);
      break;
    case 'ticket':
      processTicketEvent(event);
      break;
  }

  updateSimTime(event.time || AppState.simTime);
  updateAll();
  pushEventToFeed(event);
  checkAlertConditions();
}

function processSaleEvent(event) {
  AppState.salesHistory.push({
    time: event.time,
    product: event.product,
    amount: event.amount,
  });
  if (AppState.salesHistory.length > 100) AppState.salesHistory.shift();

  AppState.totalRevenue      += event.amount;
  AppState.ordersProcessed   += 1;

  // Update hourly revenue
  const hour = event.time.split(':')[0];
  AppState.hourlyRevenue[hour] = (AppState.hourlyRevenue[hour] || 0) + event.amount;

  // Update sales health (more sales = healthier)
  AppState.stressSalesHealth = Math.min(100,
    AppState.stressSalesHealth + (AppState.ordersProcessed > 5 ? 3 : 6)
  );

  computeStressScore();
}

function processInventoryEvent(event) {
  // Init inventory item if missing
  if (!(event.product in AppState.inventory)) {
    AppState.inventory[event.product] = Math.floor(Math.random() * 150) + 50;
  }

  AppState.inventory[event.product] = Math.max(
    0,
    AppState.inventory[event.product] + (event.change || -1)
  );

  // Recalculate inventory health
  const stocks = Object.values(AppState.inventory);
  const maxStock = Math.max(...stocks, 1);
  const avgHealthPct = stocks.reduce((a, v) => a + v / maxStock, 0) / Math.max(stocks.length, 1);
  AppState.stressInventoryHealth = Math.round(avgHealthPct * 100);

  AppState.lowStockItems = stocks.filter(s => s <= 20).length;

  computeStressScore();
}

function processTicketEvent(event) {
  AppState.tickets.unshift({
    id:     event.id,
    issue:  event.issue,
    status: event.status,
    time:   event.time,
  });
  if (AppState.tickets.length > 100) AppState.tickets.pop();

  AppState.openTickets = AppState.tickets.filter(t => t.status === 'Open').length;

  // More open tickets = worse support health
  const openRatio = AppState.openTickets / Math.max(AppState.tickets.length, 1);
  AppState.stressSupportHealth = Math.round((1 - openRatio) * 100);

  computeStressScore();
}

// ══════════════════════════════════════
//  ALERT ENGINE
// ══════════════════════════════════════

let lastSalesCount = 0;
let lastSalesWindow = [];
const ALERT_COOLDOWN = {}; // prevent spam

function checkAlertConditions() {
  const now = Date.now();

  // 1. LOW STOCK CRISIS
  Object.entries(AppState.inventory).forEach(([product, stock]) => {
    const key = 'lowstock_' + product;
    if (stock <= 15 && stock > 0 && (!ALERT_COOLDOWN[key] || now - ALERT_COOLDOWN[key] > 30000)) {
      ALERT_COOLDOWN[key] = now;
      const alert = addAlert('crisis',
        `⚠ Low stock: ${product}`,
        `Only ${stock} units remaining. Consider restocking immediately.`
      );
      renderNewAlert(alert);
    }
    // Out of stock
    const keyOos = 'oos_' + product;
    if (stock === 0 && (!ALERT_COOLDOWN[keyOos] || now - ALERT_COOLDOWN[keyOos] > 60000)) {
      ALERT_COOLDOWN[keyOos] = now;
      const alert = addAlert('crisis',
        `🔴 OUT OF STOCK: ${product}`,
        `${product} is completely out of stock. Immediate action required.`
      );
      renderNewAlert(alert);
    }
  });

  // 2. SALES SPIKE OPPORTUNITY
  const recentSales = AppState.salesHistory.slice(-5);
  const olderSales  = AppState.salesHistory.slice(-10, -5);
  if (recentSales.length >= 5 && olderSales.length >= 5) {
    const recentAvg = recentSales.reduce((a, s) => a + s.amount, 0) / 5;
    const olderAvg  = olderSales.reduce((a, s) => a + s.amount, 0) / 5;
    const key = 'sales_spike';
    if (recentAvg > olderAvg * 1.5 && (!ALERT_COOLDOWN[key] || now - ALERT_COOLDOWN[key] > 45000)) {
      ALERT_COOLDOWN[key] = now;
      const pct = Math.round((recentAvg / olderAvg - 1) * 100);
      const alert = addAlert('opportunity',
        `📈 Sales spike detected (+${pct}%)`,
        `Recent average ₹${Math.round(recentAvg)} vs earlier ₹${Math.round(olderAvg)}. Capitalize now!`
      );
      renderNewAlert(alert);
    }

    // 3. SALES DROP ANOMALY
    const keyDrop = 'sales_drop';
    if (recentAvg < olderAvg * 0.6 && (!ALERT_COOLDOWN[keyDrop] || now - ALERT_COOLDOWN[keyDrop] > 45000)) {
      ALERT_COOLDOWN[keyDrop] = now;
      const pct = Math.round((1 - recentAvg / olderAvg) * 100);
      const alert = addAlert('anomaly',
        `📉 Sales dropped ${pct}% in recent window`,
        `Monitor customer demand and check for operational issues.`
      );
      renderNewAlert(alert);
    }
  }

  // 4. HIGH OPEN TICKETS
  const key = 'high_tickets';
  if (AppState.openTickets >= 8 && (!ALERT_COOLDOWN[key] || now - ALERT_COOLDOWN[key] > 60000)) {
    ALERT_COOLDOWN[key] = now;
    const alert = addAlert('crisis',
      `⚡ ${AppState.openTickets} open support tickets`,
      `Customer support queue is growing. Assign more staff.`
    );
    renderNewAlert(alert);
  }

  // 5. STRESS SCORE HIGH
  const keyStress = 'high_stress';
  if (AppState.stressScore >= 70 && (!ALERT_COOLDOWN[keyStress] || now - ALERT_COOLDOWN[keyStress] > 60000)) {
    ALERT_COOLDOWN[keyStress] = now;
    const alert = addAlert('crisis',
      `🚨 Business Stress Score: ${AppState.stressScore}/100`,
      `Multiple risk factors detected. Consider activating War Room mode.`
    );
    renderNewAlert(alert);
  }
}

// ══════════════════════════════════════
//  UI RENDERERS
// ══════════════════════════════════════

function updateAll() {
  renderKPIs();
  renderStressScore();
  renderInventoryBars();
  renderLowStockList();
  renderTicketTable();
  renderTicketSubText();
  updateAllCharts();
  updateAlertBadge();
  updateWarRoomMetrics();
}

function updateSimTime(t) {
  $('simTime').textContent = t;
}

// ── KPIs ──
function renderKPIs() {
  const prevRevenue = AppState._prevRevenue || 0;
  const prevOrders  = AppState._prevOrders  || 0;

  setKPI('kpiSalesVal',    formatRupee(AppState.totalRevenue));
  setKPI('kpiOrdersVal',   AppState.ordersProcessed);
  setKPI('kpiTicketsVal',  AppState.openTickets);
  setKPI('kpiLowStockVal', AppState.lowStockItems);

  // Trends
  const salesDiff = AppState.totalRevenue - prevRevenue;
  setTrend('kpiSalesTrend',  salesDiff,  formatRupee(Math.abs(salesDiff)));
  const orderDiff = AppState.ordersProcessed - prevOrders;
  setTrend('kpiOrdersTrend', orderDiff, Math.abs(orderDiff) + ' orders');

  // Ticket trend (inverse)
  const ticketEl = $('kpiTicketsTrend');
  if (ticketEl) {
    ticketEl.textContent = AppState.openTickets === 0 ? '✓ All clear' : `${AppState.openTickets} need attention`;
    ticketEl.className = 'kpi-trend ' + (AppState.openTickets > 5 ? 'down' : '');
  }

  const lowStockEl = $('kpiLowStockTrend');
  if (lowStockEl) {
    lowStockEl.textContent = AppState.lowStockItems === 0 ? '✓ All stocked' : `${AppState.lowStockItems} items low`;
    lowStockEl.className = 'kpi-trend ' + (AppState.lowStockItems > 0 ? 'down' : '');
  }

  AppState._prevRevenue = AppState.totalRevenue;
  AppState._prevOrders  = AppState.ordersProcessed;
}

function setKPI(id, val) {
  const el = $(id);
  if (!el) return;
  if (el.textContent !== String(val)) {
    el.textContent = val;
    el.closest('.kpi-card')?.classList.remove('flash');
    void el.closest('.kpi-card')?.offsetWidth; // reflow
    el.closest('.kpi-card')?.classList.add('flash');
  }
}

function setTrend(id, diff, label) {
  const el = $(id);
  if (!el) return;
  if (diff === 0) { el.textContent = '— same'; el.className = 'kpi-trend'; return; }
  el.textContent = (diff > 0 ? '↑ +' : '↓ -') + label;
  el.className   = 'kpi-trend ' + (diff > 0 ? 'up' : 'down');
}

// ── STRESS ──
function renderStressScore() {
  const score = AppState.stressScore;
  const meta  = getStressLabel(score);

  $('stressScore').textContent    = score;
  $('stressMiniVal').textContent  = score;

  // Color
  $('stressMiniVal').className = 'stress-mini-val ' + meta.cls;
  $('stressScore').style.color = meta.color;

  // Status
  const indicator = document.querySelector('.status-indicator');
  if (indicator) indicator.className = 'status-indicator ' + meta.cls;
  $('stressStatusText').textContent = meta.label;

  // Breakdown bars
  setBreakdown('bfSales',   'bvSales',   AppState.stressSalesHealth);
  setBreakdown('bfInv',     'bvInv',     AppState.stressInventoryHealth);
  setBreakdown('bfSupport', 'bvSupport', AppState.stressSupportHealth);

  updateStressGauge(score);
}

function setBreakdown(fillId, valId, health) {
  const fill = $(fillId), val = $(valId);
  if (!fill || !val) return;
  fill.style.width = health + '%';
  val.textContent  = health;
  // Color the fill
  if (health >= 60) fill.style.background = '#2ecc71';
  else if (health >= 35) fill.style.background = '#f5a623';
  else fill.style.background = '#ff3b3b';
}

// ── INVENTORY BARS ──
function renderInventoryBars() {
  const container = $('inventoryBars');
  if (!container) return;

  const entries = Object.entries(AppState.inventory);
  if (entries.length === 0) { container.innerHTML = '<p class="empty-state">Waiting for inventory data...</p>'; return; }

  const maxStock = Math.max(...entries.map(([,v]) => v), 1);

  container.innerHTML = entries.map(([product, stock]) => {
    const pct  = Math.round((stock / (maxStock * 1.2)) * 100);
    const cls  = getStockClass(stock, maxStock * 1.2);
    const warn = cls === 'critical' ? '⚠' : cls === 'low' ? '↓' : '';
    return `
      <div class="inv-bar-row">
        <span class="inv-product-name">${product}</span>
        <div class="inv-bar-track">
          <div class="inv-bar-fill ${cls}" style="width:${Math.max(2, pct)}%"></div>
        </div>
        <span class="inv-stock-count ${cls !== 'ok' ? cls : ''}">${stock}</span>
        <span class="inv-warning">${warn}</span>
      </div>`;
  }).join('');
}

// ── LOW STOCK LIST ──
function renderLowStockList() {
  const container = $('lowStockList');
  if (!container) return;

  const lowItems = Object.entries(AppState.inventory).filter(([, v]) => v <= 20);
  if (lowItems.length === 0) {
    container.innerHTML = '<p class="empty-state">✓ All items are adequately stocked</p>';
    return;
  }
  container.innerHTML = lowItems.map(([product, stock]) => `
    <div class="low-stock-item">
      <span class="product">⚠ ${product}</span>
      <span class="count">${stock} units left</span>
    </div>`).join('');
}

// ── TICKETS ──
function renderTicketTable() {
  const container = $('ticketTable');
  if (!container) return;

  const header = `
    <div class="ticket-row ticket-header">
      <span>ID</span><span>ISSUE</span><span>STATUS</span><span>TIME</span>
    </div>`;

  const rows = AppState.tickets.slice(0, 30).map(t => `
    <div class="ticket-row ticket-data-row">
      <span class="ticket-id">#${t.id}</span>
      <span>${t.issue}</span>
      <span><span class="ticket-status-badge status-${t.status.toLowerCase()}">${t.status}</span></span>
      <span class="ticket-time">${t.time}</span>
    </div>`).join('');

  container.innerHTML = header + (rows || '<div class="empty-state">No tickets yet</div>');
}

function renderTicketSubText() {
  const el = $('ticketSubText');
  if (!el) return;
  const open   = AppState.tickets.filter(t => t.status === 'Open').length;
  const closed = AppState.tickets.filter(t => t.status === 'Closed').length;
  el.textContent = `${open} open • ${closed} closed`;
}

// ── ALERTS ──
function renderNewAlert(alert) {
  // Mini feed (overview)
  const feed = $('alertsFeed');
  if (feed) {
    const noAlerts = feed.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();

    const el = document.createElement('div');
    el.className = `alert-item ${alert.type}`;
    el.innerHTML = `
      <div class="alert-item-head">
        <span class="alert-item-type">${alert.type.toUpperCase()}</span>
        <span class="alert-item-time">${alert.time}</span>
      </div>
      <div class="alert-item-msg">${alert.message}</div>`;
    feed.prepend(el);

    // Keep max 8
    const items = feed.querySelectorAll('.alert-item');
    if (items.length > 8) items[items.length - 1].remove();
  }

  // Full alerts page
  renderAlertsFullList();

  // War room crisis alerts
  if (alert.type === 'crisis') renderWarRoomAlerts();
}

function updateAlertBadge() {
  const count = AppState.alerts.length;
  const badge = $('alertNavBadge');
  const countBadge = $('alertCountBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.dataset.count = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (countBadge) countBadge.textContent = count + ' active';
}

function renderAlertsFullList(filter = AppState._alertFilter || 'all') {
  AppState._alertFilter = filter;
  const container = $('alertsFullList');
  if (!container) return;

  const filtered = filter === 'all'
    ? AppState.alerts
    : AppState.alerts.filter(a => a.type === filter);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="no-alerts-full">No alerts in this category yet.</div>';
    return;
  }

  container.innerHTML = filtered.map(a => `
    <div class="alert-full-item ${a.type}">
      <div class="afl-head">
        <span class="afl-badge ${a.type}">${a.type.toUpperCase()}</span>
        <span class="afl-time">${a.time}</span>
      </div>
      <div class="afl-msg">${a.message}</div>
      ${a.detail ? `<div class="afl-detail">${a.detail}</div>` : ''}
    </div>`).join('');
}

function filterAlerts(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAlertsFullList(type);
}

// ── EVENTS FEED ──
function pushEventToFeed(event) {
  const feed = $('eventsFeed');
  if (!feed) return;

  const placeholder = feed.querySelector('.event-placeholder');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = 'event-item';

  let dotCls = '', msg = '';
  if (event.type === 'sale') {
    dotCls = 'sale'; msg = `Sale: ${event.product} — ${formatRupee(event.amount)}`;
  } else if (event.type === 'inventory') {
    dotCls = 'inventory'; msg = `Inventory: ${event.product} (${event.change > 0 ? '+' : ''}${event.change})`;
  } else {
    dotCls = 'ticket'; msg = `Ticket #${event.id}: ${event.issue} [${event.status}]`;
  }

  el.innerHTML = `
    <span class="event-time">${event.time || AppState.simTime}</span>
    <span class="event-dot ${dotCls}"></span>
    <span class="event-msg">${msg}</span>`;

  feed.prepend(el);
  const items = feed.querySelectorAll('.event-item');
  if (items.length > 12) items[items.length - 1].remove();
}

// ── CHARTS UPDATE ──
function updateAllCharts() {
  updateSalesTrendChart(AppState.salesHistory);
  updateSalesFullChart(AppState.salesHistory);
  updateTopProductsChart(AppState.salesHistory);
  updateRevenueHourChart(AppState.hourlyRevenue);
  updateStockDonutChart(AppState.inventory);
  updateTicketStatusChart(AppState.tickets);
  updateIssueCategoryChart(AppState.tickets);
}

// ══════════════════════════════════════
//  VIEW SWITCHING
// ══════════════════════════════════════

function switchView(viewName, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');
  if (el) el.classList.add('active');

  $('pageTitle').textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);

  // Refresh relevant content
  if (viewName === 'alerts') renderAlertsFullList();
}

// ══════════════════════════════════════
//  ROLE SWITCHING
// ══════════════════════════════════════

function setRole(role) {
  AppState.currentRole = role;
  $('roleOwner').classList.toggle('active', role === 'owner');
  $('roleOps').classList.toggle('active',   role === 'ops');

  const eventsCard = document.querySelector('.events-card');
  if (eventsCard) eventsCard.style.display = role === 'ops' ? 'block' : 'none';

  // Owner = focus on revenue KPIs; Ops = focus on inventory/tickets
  // (color hints)
  const kpiSales = $('kpi-sales');
  if (kpiSales) kpiSales.style.borderColor = role === 'owner' ? 'rgba(245,166,35,0.25)' : '';
  const kpiInv = $('kpi-lowstock');
  if (kpiInv) kpiInv.style.borderColor = role === 'ops' ? 'rgba(245,166,35,0.25)' : '';
}

// ══════════════════════════════════════
//  PAUSE / RESUME
// ══════════════════════════════════════

function togglePause() {
  AppState.paused = !AppState.paused;
  const btn = $('pauseBtn');
  if (AppState.paused) {
    btn.textContent = '▶ RESUME';
    btn.classList.add('paused');
  } else {
    btn.textContent = '⏸ PAUSE';
    btn.classList.remove('paused');
  }
}

// ══════════════════════════════════════
//  WAR ROOM
// ══════════════════════════════════════

function toggleWarRoom() {
  const overlay = $('warRoomOverlay');
  const isActive = overlay.classList.toggle('active');
  if (isActive) {
    renderWarRoomAlerts();
    updateWarRoomMetrics();
    renderWarRoomActions();
  }
}

function renderWarRoomAlerts() {
  const container = $('warAlerts');
  if (!container) return;
  const crisisAlerts = AppState.alerts.filter(a => a.type === 'crisis');
  if (crisisAlerts.length === 0) {
    container.innerHTML = '<p class="war-empty">No critical alerts at this time</p>';
    return;
  }
  container.innerHTML = crisisAlerts.slice(0, 6).map(a => `
    <div class="war-alert-item">${a.message}</div>`).join('');
}

function updateWarRoomMetrics() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const meta = getStressLabel(AppState.stressScore);
  set('wmStress',  AppState.stressScore + '/100');
  set('wmTickets', AppState.openTickets);
  set('wmStock',   AppState.lowStockItems + ' low');
  set('wmRevenue', formatRupee(AppState.totalRevenue));
  set('stressMiniVal', AppState.stressScore);
}

function renderWarRoomActions() {
  const container = $('warActions');
  if (!container) return;

  const actions = [];
  if (AppState.lowStockItems > 0)
    actions.push(`Restock ${AppState.lowStockItems} low-inventory items immediately`);
  if (AppState.openTickets > 5)
    actions.push(`${AppState.openTickets} open tickets need resolution — allocate support staff`);
  if (AppState.stressScore > 70)
    actions.push('Stress score critical — identify bottleneck in sales or supply chain');
  if (AppState.salesHistory.length < 3)
    actions.push('Low sales activity detected — check storefront & marketing channels');
  if (actions.length === 0)
    actions.push('Continue monitoring — no immediate actions required');

  container.innerHTML = actions.map(a =>
    `<div class="war-action-item">${a}</div>`
  ).join('');
}