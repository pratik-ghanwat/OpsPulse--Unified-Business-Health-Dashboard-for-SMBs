// ═══════════════════════════════════════
//  OPSPULSE — SHARED STATE
// ═══════════════════════════════════════

const AppState = {
  // Business context
  bizType: sessionStorage.getItem('opspulse_biz_type') || 'retail',
  bizIcon: sessionStorage.getItem('opspulse_biz_icon') || '🏪',
  bizName: sessionStorage.getItem('opspulse_biz_name') || 'Retail Store',

  // Current simulation time
  simTime: '10:00',

  // KPIs
  totalSales: 0,
  ordersProcessed: 0,
  openTickets: 0,
  lowStockItems: 0,
  totalRevenue: 0,

  // Stress
  stressScore: 0,
  stressSalesHealth: 0,
  stressInventoryHealth: 0,
  stressSupportHealth: 0,

  // Inventory map: { productName: stockCount }
  inventory: {},

  // Tickets array
  tickets: [],

  // Sales history: [{ time, amount, product }]
  salesHistory: [],

  // Hourly revenue: { '10': 0, '11': 0, ... }
  hourlyRevenue: {},

  // Alerts array
  alerts: [],

  // Role
  currentRole: 'owner',

  // Pause
  paused: false,

  // Simulation paused
  simulationRunning: false,
};

// ── ALERT HELPERS ──

/**
 * Add a new alert to state.
 * type: 'crisis' | 'opportunity' | 'anomaly'
 */
function addAlert(type, message, detail = '') {
  const alert = {
    id:      Date.now() + Math.random(),
    type,
    message,
    detail,
    time:    AppState.simTime,
    ts:      Date.now(),
  };
  AppState.alerts.unshift(alert); // newest first
  if (AppState.alerts.length > 50) AppState.alerts.pop();
  return alert;
}

/**
 * Compute stress score from components.
 * Each component contributes to stress 0-100.
 */
function computeStressScore() {
  const s = AppState.stressSalesHealth;     // 0=bad,100=good
  const i = AppState.stressInventoryHealth;
  const t = AppState.stressSupportHealth;

  // Stress = inverse of health, weighted
  const stress = Math.round(
    (1 - s / 100) * 40 +
    (1 - i / 100) * 35 +
    (1 - t / 100) * 25
  );

  AppState.stressScore = Math.min(100, Math.max(0, stress));
  return AppState.stressScore;
}

/**
 * Format rupee amount
 */
function formatRupee(amount) {
  if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
  if (amount >= 1000)   return '₹' + (amount / 1000).toFixed(1) + 'K';
  return '₹' + amount;
}

/**
 * Get stress label
 */
function getStressLabel(score) {
  if (score <= 40) return { label: 'HEALTHY',      cls: 'good',     color: '#2ecc71' };
  if (score <= 70) return { label: 'MODERATE RISK', cls: 'moderate', color: '#f5a623' };
  return               { label: 'HIGH RISK',       cls: 'danger',   color: '#ff3b3b' };
}

/**
 * Get stock level class
 */
function getStockClass(count, max) {
  const pct = max > 0 ? (count / max) : 1;
  if (pct <= 0.15) return 'critical';
  if (pct <= 0.35) return 'low';
  return 'ok';
}