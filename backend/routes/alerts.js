// ═══════════════════════════════════════════════
//  OPSPULSE — ALERT ENGINE
//  Checks conditions and generates smart alerts
// ═══════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const analytics = require('./analytics');

// ══════════════════════════════════════════════
//  ALERT STORE
// ══════════════════════════════════════════════

const alertStore = {
  alerts: [],        // all fired alerts
  cooldowns: {},     // { alertKey: timestamp } — prevent spam
};

const COOLDOWN_MS = {
  low_stock:    30000,   // 30 sec
  out_of_stock: 60000,   // 60 sec
  sales_spike:  45000,
  sales_drop:   45000,
  high_tickets: 60000,
  stress_high:  60000,
  stress_surge: 90000,
};

// WebSocket broadcast callback (set by server.js)
let _broadcastFn = null;

function setBroadcast(fn) {
  _broadcastFn = fn;
}

// ── CREATE ALERT ──
function createAlert(type, message, detail = '', data = {}) {
  const alert = {
    id:      `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,            // 'crisis' | 'opportunity' | 'anomaly'
    message,
    detail,
    data,
    time:    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    ts:      Date.now(),
  };

  alertStore.alerts.unshift(alert);
  if (alertStore.alerts.length > 100) alertStore.alerts.pop();

  // Broadcast over WebSocket to all connected clients
  if (_broadcastFn) {
    _broadcastFn({ type: 'alert', alert });
  }

  console.log(`[Alert][${type.toUpperCase()}] ${message}`);
  return alert;
}

// ── COOLDOWN CHECK ──
function canFire(key, customMs) {
  const ms  = customMs || COOLDOWN_MS[key] || 30000;
  const now = Date.now();
  if (alertStore.cooldowns[key] && now - alertStore.cooldowns[key] < ms) {
    return false;
  }
  alertStore.cooldowns[key] = now;
  return true;
}

// ══════════════════════════════════════════════
//  ALERT CONDITIONS
//  Called after every event is ingested.
// ══════════════════════════════════════════════

function checkAllConditions(event, currentState) {
  const fired = [];

  // Pull fresh analytics
  const kpis      = analytics.getKPIs();
  const stress    = analytics.computeStress();
  const inventory = _getInventory(currentState);
  const sales     = _getSalesHistory(currentState);

  // ── 1. LOW STOCK / OUT OF STOCK ──
  Object.entries(inventory).forEach(([product, stock]) => {
    if (stock === 0) {
      const key = `out_of_stock_${product}`;
      if (canFire(key)) {
        fired.push(createAlert(
          'crisis',
          `🔴 OUT OF STOCK: ${product}`,
          `${product} has zero units remaining. Sales of this item cannot proceed.`,
          { product, stock }
        ));
      }
    } else if (stock <= 15) {
      const key = `low_stock_${product}`;
      if (canFire(key)) {
        fired.push(createAlert(
          'crisis',
          `⚠ Low stock: ${product} (${stock} units)`,
          `Stock is critically low. Reorder immediately to avoid stockout.`,
          { product, stock }
        ));
      }
    } else if (stock <= 30) {
      const key = `warn_stock_${product}`;
      if (canFire(key, 120000)) {
        fired.push(createAlert(
          'anomaly',
          `📦 Stock warning: ${product} (${stock} units)`,
          `Inventory is running low. Consider scheduling a restock.`,
          { product, stock }
        ));
      }
    }
  });

  // ── 2. SALES SPIKE (OPPORTUNITY) ──
  if (sales.length >= 10) {
    const recent = sales.slice(-5).map(s => s.amount);
    const older  = sales.slice(-10, -5).map(s => s.amount);
    const recentAvg = _avg(recent);
    const olderAvg  = _avg(older);

    if (olderAvg > 0) {
      const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;

      if (changePct >= 50 && canFire('sales_spike')) {
        fired.push(createAlert(
          'opportunity',
          `📈 Sales spike: +${Math.round(changePct)}% in recent window`,
          `Recent avg ₹${Math.round(recentAvg)} vs earlier ₹${Math.round(olderAvg)}. Push promotions now!`,
          { changePct: Math.round(changePct), recentAvg, olderAvg }
        ));
      }

      // ── 3. SALES DROP (ANOMALY) ──
      if (changePct <= -40 && canFire('sales_drop')) {
        fired.push(createAlert(
          'anomaly',
          `📉 Sales dropped ${Math.abs(Math.round(changePct))}% recently`,
          `Monitor demand. Check if a product or category is causing the drop.`,
          { changePct: Math.round(changePct), recentAvg, olderAvg }
        ));
      }
    }
  }

  // ── 4. HIGH OPEN TICKETS ──
  if (kpis.openTickets >= 8 && canFire('high_tickets')) {
    fired.push(createAlert(
      'crisis',
      `⚡ ${kpis.openTickets} open support tickets`,
      `Customer support queue is building up. Assign additional staff immediately.`,
      { openTickets: kpis.openTickets }
    ));
  }

  // ── 5. HIGH STRESS SCORE ──
  if (stress >= 70 && canFire('stress_high')) {
    fired.push(createAlert(
      'crisis',
      `🚨 Business Stress Score: ${stress}/100 — HIGH RISK`,
      `Multiple operational risks detected. Activate War Room mode for immediate action.`,
      { stressScore: stress }
    ));
  }

  // ── 6. STRESS SURGE (jumped fast) ──
  const prevStress = alertStore._lastStress || 0;
  if (stress - prevStress >= 15 && canFire('stress_surge')) {
    fired.push(createAlert(
      'anomaly',
      `⚡ Stress score surged by ${stress - prevStress} points`,
      `Rapid deterioration detected. Review inventory and support queue.`,
      { from: prevStress, to: stress }
    ));
  }
  alertStore._lastStress = stress;

  // ── 7. PRODUCT OPPORTUNITY (top seller trending up) ──
  if (event.type === 'sale' && sales.length >= 5) {
    const productSales = sales.filter(s => s.product === event.product);
    if (productSales.length >= 3) {
      const productKey = `hot_product_${event.product}`;
      const recent3    = productSales.slice(-3).map(s => s.amount);
      const avg3       = _avg(recent3);
      if (avg3 > 2000 && canFire(productKey, 120000)) {
        fired.push(createAlert(
          'opportunity',
          `🔥 Hot product: ${event.product} averaging ₹${Math.round(avg3)}`,
          `This product is selling strongly. Ensure stock is adequate and consider promoting it.`,
          { product: event.product, avgAmount: Math.round(avg3) }
        ));
      }
    }
  }

  return fired;
}

// ══════════════════════════════════════════════
//  MAIN ENTRY — called by server.js per event
// ══════════════════════════════════════════════

function processEvent(event, currentState = {}) {
  // Ingest into analytics first
  analytics.ingestEvent(event);

  // Then check alert conditions
  return checkAllConditions(event, currentState);
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════

function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// These read from analytics module's internal state
// In production you'd pass state explicitly or use a shared DB
function _getInventory(state) {
  // If caller passes state, use it; otherwise fall back to empty
  return state.inventory || {};
}

function _getSalesHistory(state) {
  return state.salesHistory || [];
}

function clearAlerts() {
  alertStore.alerts  = [];
  alertStore.cooldowns = {};
  alertStore._lastStress = 0;
}

// ══════════════════════════════════════════════
//  REST ENDPOINTS
// ══════════════════════════════════════════════

// GET /api/alerts  → all alerts
router.get('/', (req, res) => {
  const { type, limit = 50 } = req.query;
  let results = alertStore.alerts;
  if (type) results = results.filter(a => a.type === type);
  res.json({
    alerts: results.slice(0, parseInt(limit)),
    total:  alertStore.alerts.length,
    counts: {
      crisis:      alertStore.alerts.filter(a => a.type === 'crisis').length,
      opportunity: alertStore.alerts.filter(a => a.type === 'opportunity').length,
      anomaly:     alertStore.alerts.filter(a => a.type === 'anomaly').length,
    }
  });
});

// GET /api/alerts/crisis  → only crisis alerts
router.get('/crisis', (req, res) => {
  res.json(alertStore.alerts.filter(a => a.type === 'crisis'));
});

// GET /api/alerts/recent?minutes=5
router.get('/recent', (req, res) => {
  const minutes = parseInt(req.query.minutes) || 5;
  const cutoff  = Date.now() - minutes * 60 * 1000;
  res.json(alertStore.alerts.filter(a => a.ts >= cutoff));
});

// POST /api/alerts/clear
router.post('/clear', (req, res) => {
  clearAlerts();
  res.json({ success: true, message: 'All alerts cleared' });
});

// POST /api/alerts/test  → manually fire a test alert
router.post('/test', (req, res) => {
  const { type = 'anomaly', message = 'Test alert', detail = '' } = req.body;
  const alert = createAlert(type, message, detail);
  res.json({ success: true, alert });
});

module.exports = router;
module.exports.processEvent  = processEvent;
module.exports.setBroadcast  = setBroadcast;
module.exports.createAlert   = createAlert;
module.exports.clearAlerts   = clearAlerts;
module.exports.alertStore    = alertStore;