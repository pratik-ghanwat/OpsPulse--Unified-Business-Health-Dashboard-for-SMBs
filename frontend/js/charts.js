// ═══════════════════════════════════════
//  OPSPULSE — CHARTS
// ═══════════════════════════════════════

// Chart.js global defaults
Chart.defaults.color            = '#4d5468';
Chart.defaults.borderColor      = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family      = "'Space Mono', monospace";
Chart.defaults.font.size        = 10;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.animation.duration     = 400;

const CHART_COLORS = {
  amber:  '#f5a623',
  blue:   '#4a9eff',
  purple: '#a78bfa',
  green:  '#2ecc71',
  red:    '#ff6b6b',
};

const Charts = {};

// ── STRESS GAUGE ──
function initStressGauge() {
  const ctx = document.getElementById('stressGauge');
  if (!ctx) return;

  Charts.stressGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#4d5468', '#1a1d2e'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }]
    },
    options: {
      responsive: false,
      cutout: '78%',
      plugins: { tooltip: { enabled: false } },
      animation: { duration: 600, easing: 'easeInOutQuart' },
    }
  });
}

function updateStressGauge(score) {
  if (!Charts.stressGauge) return;
  const { color } = getStressLabel(score);
  Charts.stressGauge.data.datasets[0].data = [score, 100 - score];
  Charts.stressGauge.data.datasets[0].backgroundColor = [color, '#1a1d2e'];
  Charts.stressGauge.update('active');
}

// ── SALES TREND (OVERVIEW) ──
function initSalesTrendChart() {
  const ctx = document.getElementById('salesTrendChart');
  if (!ctx) return;

  Charts.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: CHART_COLORS.amber,
        backgroundColor: 'rgba(245,166,35,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: CHART_COLORS.amber,
        pointBorderWidth: 0,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 5 },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: {
            callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'K' : v),
            maxTicksLimit: 4,
          }
        }
      },
      plugins: { tooltip: {
        callbacks: {
          label: ctx => '₹' + ctx.raw.toLocaleString('en-IN')
        }
      }}
    }
  });
}

function updateSalesTrendChart(salesHistory) {
  if (!Charts.salesTrend) return;
  const last = salesHistory.slice(-15);
  Charts.salesTrend.data.labels   = last.map(s => s.time);
  Charts.salesTrend.data.datasets[0].data = last.map(s => s.amount);
  Charts.salesTrend.update('none');
}

// ── SALES FULL (SALES VIEW) ──
function initSalesFullChart() {
  const ctx = document.getElementById('salesFullChart');
  if (!ctx) return;

  Charts.salesFull = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: 'rgba(245,166,35,0.7)',
      borderColor: CHART_COLORS.amber,
      borderWidth: 1,
      borderRadius: 4,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { callback: v => formatRupee(v) }
        }
      }
    }
  });
}

function updateSalesFullChart(salesHistory) {
  if (!Charts.salesFull) return;
  const last = salesHistory.slice(-20);
  Charts.salesFull.data.labels = last.map(s => s.time);
  Charts.salesFull.data.datasets[0].data = last.map(s => s.amount);
  Charts.salesFull.update('none');
}

// ── TOP PRODUCTS (SALES VIEW) ──
function initTopProductsChart() {
  const ctx = document.getElementById('topProductsChart');
  if (!ctx) return;

  Charts.topProducts = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: [
        'rgba(245,166,35,0.7)', 'rgba(74,158,255,0.7)',
        'rgba(167,139,250,0.7)', 'rgba(46,204,113,0.7)',
        'rgba(255,107,107,0.7)'
      ],
      borderWidth: 0,
      borderRadius: 4,
    }]},
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { callback: v => formatRupee(v) }
        },
        y: { grid: { display: false } }
      }
    }
  });
}

function updateTopProductsChart(salesHistory) {
  if (!Charts.topProducts) return;

  // Aggregate by product
  const totals = {};
  salesHistory.forEach(s => {
    totals[s.product] = (totals[s.product] || 0) + s.amount;
  });
  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  Charts.topProducts.data.labels = sorted.map(([k]) => k);
  Charts.topProducts.data.datasets[0].data = sorted.map(([, v]) => v);
  Charts.topProducts.update('none');
}

// ── REVENUE BY HOUR ──
function initRevenueHourChart() {
  const ctx = document.getElementById('revenueHourChart');
  if (!ctx) return;

  Charts.revenueHour = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      data: [],
      borderColor: CHART_COLORS.blue,
      backgroundColor: 'rgba(74,158,255,0.07)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: CHART_COLORS.blue,
      fill: true,
      tension: 0.3,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { callback: v => formatRupee(v) }
        }
      }
    }
  });
}

function updateRevenueHourChart(hourlyRevenue) {
  if (!Charts.revenueHour) return;
  const hours = Object.keys(hourlyRevenue).sort();
  Charts.revenueHour.data.labels = hours.map(h => h + ':00');
  Charts.revenueHour.data.datasets[0].data = hours.map(h => hourlyRevenue[h]);
  Charts.revenueHour.update('none');
}

// ── STOCK DONUT ──
function initStockDonutChart() {
  const ctx = document.getElementById('stockDonutChart');
  if (!ctx) return;

  Charts.stockDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          CHART_COLORS.green, CHART_COLORS.amber, CHART_COLORS.red,
          CHART_COLORS.blue, CHART_COLORS.purple
        ],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 10, padding: 10 }
        },
        tooltip: {
          callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' units' }
        }
      }
    }
  });
}

function updateStockDonutChart(inventory) {
  if (!Charts.stockDonut) return;
  const entries = Object.entries(inventory).slice(0, 5);
  Charts.stockDonut.data.labels = entries.map(([k]) => k);
  Charts.stockDonut.data.datasets[0].data = entries.map(([, v]) => v);
  Charts.stockDonut.update('none');
}

// ── TICKET STATUS CHART ──
function initTicketStatusChart() {
  const ctx = document.getElementById('ticketStatusChart');
  if (!ctx) return;

  Charts.ticketStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Open', 'Closed', 'Pending'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: [
          'rgba(255,59,59,0.7)',
          'rgba(46,204,113,0.7)',
          'rgba(74,158,255,0.7)'
        ],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10 } }
      }
    }
  });
}

function updateTicketStatusChart(tickets) {
  if (!Charts.ticketStatus) return;
  const open    = tickets.filter(t => t.status === 'Open').length;
  const closed  = tickets.filter(t => t.status === 'Closed').length;
  const pending = tickets.filter(t => t.status === 'Pending').length;
  Charts.ticketStatus.data.datasets[0].data = [open, closed, pending];
  Charts.ticketStatus.update('none');
}

// ── ISSUE CATEGORY CHART ──
function initIssueCategoryChart() {
  const ctx = document.getElementById('issueCategoryChart');
  if (!ctx) return;

  Charts.issueCategory = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: 'rgba(167,139,250,0.7)',
      borderColor: CHART_COLORS.purple,
      borderWidth: 1,
      borderRadius: 4,
    }]},
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { stepSize: 1 }
        },
        y: { grid: { display: false } }
      }
    }
  });
}

function updateIssueCategoryChart(tickets) {
  if (!Charts.issueCategory) return;
  const cats = {};
  tickets.forEach(t => {
    // Extract category from issue text (first word)
    const cat = t.issue.split(' ')[0];
    cats[cat] = (cats[cat] || 0) + 1;
  });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
  Charts.issueCategory.data.labels = sorted.map(([k]) => k);
  Charts.issueCategory.data.datasets[0].data = sorted.map(([, v]) => v);
  Charts.issueCategory.update('none');
}

// ── INIT ALL CHARTS ──
function initAllCharts() {
  initStressGauge();
  initSalesTrendChart();
  initSalesFullChart();
  initTopProductsChart();
  initRevenueHourChart();
  initStockDonutChart();
  initTicketStatusChart();
  initIssueCategoryChart();
}