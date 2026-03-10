// ═══════════════════════════════════════════════
//  OPSPULSE — ANALYTICS ENGINE
//  Computes KPIs, stress score, trends from state
// ═══════════════════════════════════════════════

const express = require('express');
const router  = express.Router();

// ══════════════════════════════════════════════
//  IN-MEMORY STATE
//  Accumulated from processed events.
//  In production: replace with Redis or a DB.
// ══════════════════════════════════════════════

const State = {
  salesHistory:     [],   // [{ time, product, amount }]
  inventory:        {},   // { product: currentStock }
  inventoryMax:     {},   // { product: initialStock }
  tickets:          [],   // [{ id, issue, status, time }]
  hourlyRevenue:    {},   // { '10': 4500, '11': 7200, ... }

  // Health scores (0–100, higher = healthier)
  salesHealth:     100,
  inventoryHealth: 100,
  supportHealth:   100,
};

// ══════════════════════════════════════════════
//  EVENT INGESTION
//  Called by server.js when WebSocket receives
//  an event, so analytics stay up-to-date.
// ══════════════════════════════════════════════

function ingestEvent(event) {
  switch (event.type) {
    case 'inventory_snapshot':
      Object.entries(event.inventory).forEach(([product, stock]) => {
        State.inventory[product]    = stock;
        State.inventoryMax[product] = stock; // record starting level
      });
      break;

    case 'sale':
      State.salesHistory.push({
        time:    event.time,
        product: event.product,
        amount:  event.amount,
      });
      if (State.salesHistory.length > 500) State.salesHistory.shift();

      // Hourly revenue
      const hour = (event.time || '00:00').split(':')[0];
      State.hourlyRevenue[hour] = (State.hourlyRevenue[hour] || 0) + event.amount;

      _recalcSalesHealth();
      break;

    case 'inventory':
      if (!(event.product in State.inventory)) {
        State.inventory[event.product]    = event.stock || 100;
        State.inventoryMax[event.product] = event.stock || 100;
      }
      State.inventory[event.product] = Math.max(
        0,
        State.inventory[event.product] + (event.change || -1)
      );
      _recalcInventoryHealth();
      break;

    case 'ticket':
      // Avoid duplicate ticket IDs
      const exists = State.tickets.find(t => String(t.id) === String(event.id));
      if (!exists) {
        State.tickets.unshift({
          id:     event.id,
          issue:  event.issue,
          status: event.status,
          time:   event.time,
        });
        if (State.tickets.length > 200) State.tickets.pop();
      }
      _recalcSupportHealth();
      break;
  }
}

// ══════════════════════════════════════════════
//  HEALTH SCORE CALCULATORS
// ══════════════════════════════════════════════

function _recalcSalesHealth() {
  const recent = State.salesHistory.slice(-10);
  const older  = State.salesHistory.slice(-20, -10);
  if (recent.length < 3) return;

  const recentAvg = _avg(recent.map(s => s.amount));
  const olderAvg  = older.length ? _avg(older.map(s => s.amount)) : recentAvg;

  // Compare recent vs older — if dropping, health decreases
  const ratio = olderAvg > 0 ? recentAvg / olderAvg : 1;
  const health = Math.min(100, Math.max(0, Math.round(ratio * 80 + 20)));
  State.salesHealth = health;
}

function _recalcInventoryHealth() {
  const stocks = Object.entries(State.inventory);
  if (stocks.length === 0) return;

  const totalRatio = stocks.reduce((sum, [product, stock]) => {
    const max = State.inventoryMax[product] || stock || 1;
    return sum + (stock / max);
  }, 0) / stocks.length;

  State.inventoryHealth = Math.round(totalRatio * 100);
}

function _recalcSupportHealth() {
  const total  = State.tickets.length;
  if (total === 0) return;
  const open   = State.tickets.filter(t => t.status === 'Open').length;
  const ratio  = open / total;
  State.supportHealth = Math.round((1 - ratio) * 100);
}

// ══════════════════════════════════════════════
//  STRESS SCORE
// ══════════════════════════════════════════════

function computeStressScore() {
  // Weights: Sales 40%, Inventory 35%, Support 25%
  const stress = Math.round(
    (1 - State.salesHealth     / 100) * 40 +
    (1 - State.inventoryHealth / 100) * 35 +
    (1 - State.supportHealth   / 100) * 25
  );
  return Math.min(100, Math.max(0, stress));
}

function getStressLabel(score) {
  if (score <= 40) return { label: 'Healthy',        level: 'healthy'  };
  if (score <= 70) return { label: 'Moderate Risk',  level: 'moderate' };
  return               { label: 'High Risk',         level: 'danger'   };
}

// ══════════════════════════════════════════════
//  KPI CALCULATIONS
// ══════════════════════════════════════════════

function getKPIs() {
  const totalRevenue      = State.salesHistory.reduce((s, r) => s + r.amount, 0);
  const ordersProcessed   = State.salesHistory.length;
  const openTickets       = State.tickets.filter(t => t.status === 'Open').length;
  const closedTickets     = State.tickets.filter(t => t.status === 'Closed').length;
  const pendingTickets    = State.tickets.filter(t => t.status === 'Pending').length;

  const lowStockItems     = Object.entries(State.inventory)
    .filter(([, stock]) => stock <= 20).length;
  const outOfStockItems   = Object.entries(State.inventory)
    .filter(([, stock]) => stock === 0).length;

  // Revenue trend: compare last 5 sales vs previous 5
  const r5  = State.salesHistory.slice(-5).map(s => s.amount);
  const r10 = State.salesHistory.slice(-10, -5).map(s => s.amount);
  const revenueTrend = r5.length && r10.length
    ? Math.round((_avg(r5) - _avg(r10)) / _avg(r10) * 100)
    : 0;

  return {
    totalRevenue,
    ordersProcessed,
    openTickets,
    closedTickets,
    pendingTickets,
    totalTickets:   State.tickets.length,
    lowStockItems,
    outOfStockItems,
    revenueTrend,   // percentage change
  };
}

function getTopProducts(limit = 5) {
  const totals = {};
  State.salesHistory.forEach(s => {
    totals[s.product] = (totals[s.product] || 0) + s.amount;
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([product, revenue]) => ({ product, revenue }));
}

function getSalesTrend(last = 20) {
  return State.salesHistory.slice(-last).map(s => ({
    time:    s.time,
    product: s.product,
    amount:  s.amount,
  }));
}

function getHourlyRevenue() {
  return Object.entries(State.hourlyRevenue)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([hour, revenue]) => ({ hour: hour + ':00', revenue }));
}

function getInventoryStatus() {
  return Object.entries(State.inventory).map(([product, stock]) => {
    const max   = State.inventoryMax[product] || stock || 1;
    const pct   = Math.round((stock / max) * 100);
    let   level = 'ok';
    if (stock === 0)   level = 'out_of_stock';
    else if (pct <= 15) level = 'critical';
    else if (pct <= 35) level = 'low';
    return { product, stock, maxStock: max, percentage: pct, level };
  });
}

function getTicketStats() {
  const open    = State.tickets.filter(t => t.status === 'Open').length;
  const closed  = State.tickets.filter(t => t.status === 'Closed').length;
  const pending = State.tickets.filter(t => t.status === 'Pending').length;

  // Category breakdown
  const categories = {};
  State.tickets.forEach(t => {
    const cat = t.issue ? t.issue.split(' ')[0] : 'Other';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  return {
    open, closed, pending,
    total: State.tickets.length,
    categories,
    recent: State.tickets.slice(0, 20),
  };
}

// ══════════════════════════════════════════════
//  HELPER
// ══════════════════════════════════════════════

function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function resetState() {
  State.salesHistory     = [];
  State.inventory        = {};
  State.inventoryMax     = {};
  State.tickets          = [];
  State.hourlyRevenue    = {};
  State.salesHealth      = 100;
  State.inventoryHealth  = 100;
  State.supportHealth    = 100;
}

// ══════════════════════════════════════════════
//  REST ENDPOINTS
// ══════════════════════════════════════════════

// GET /api/analytics/summary  → full dashboard snapshot
router.get('/summary', (req, res) => {
  const score = computeStressScore();
  res.json({
    kpis:          getKPIs(),
    stressScore:   score,
    stressMeta:    getStressLabel(score),
    healthScores: {
      sales:     State.salesHealth,
      inventory: State.inventoryHealth,
      support:   State.supportHealth,
    },
    topProducts:   getTopProducts(),
    salesTrend:    getSalesTrend(),
    hourlyRevenue: getHourlyRevenue(),
    inventory:     getInventoryStatus(),
    tickets:       getTicketStats(),
  });
});

// GET /api/analytics/kpis
router.get('/kpis', (req, res) => {
  res.json(getKPIs());
});

// GET /api/analytics/stress
router.get('/stress', (req, res) => {
  const score = computeStressScore();
  res.json({
    score,
    ...getStressLabel(score),
    breakdown: {
      sales:     State.salesHealth,
      inventory: State.inventoryHealth,
      support:   State.supportHealth,
    }
  });
});

// GET /api/analytics/sales?last=20
router.get('/sales', (req, res) => {
  const last = parseInt(req.query.last) || 20;
  res.json({
    trend:        getSalesTrend(last),
    topProducts:  getTopProducts(),
    hourlyRevenue: getHourlyRevenue(),
  });
});

// GET /api/analytics/inventory
router.get('/inventory', (req, res) => {
  res.json(getInventoryStatus());
});

// GET /api/analytics/tickets
router.get('/tickets', (req, res) => {
  res.json(getTicketStats());
});

// POST /api/analytics/reset
router.post('/reset', (req, res) => {
  resetState();
  res.json({ success: true, message: 'Analytics state reset' });
});

module.exports = router;
module.exports.ingestEvent   = ingestEvent;
module.exports.computeStress = computeStressScore;
module.exports.getKPIs       = getKPIs;
module.exports.resetState    = resetState;