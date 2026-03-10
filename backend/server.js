// ═══════════════════════════════════════════════
//  OPSPULSE — SERVER ENTRY POINT
//  Node.js + Express + WebSocket
//
//  SETUP:
//    npm install
//    node server.js         (production)
//    npx nodemon server.js  (development)
//
//  FRONTEND connects via:
//    WebSocket: ws://localhost:3000
//    REST API:  http://localhost:3000/api/*
// ═══════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const path       = require('path');

const simulationRouter             = require('./routes/simulation');
const { SimulationEngine }         = require('./routes/simulation');
const analyticsRouter              = require('./routes/analytics');
const { ingestEvent, resetState }  = require('./routes/analytics');
const alertsRouter                 = require('./routes/alerts');
const { processEvent, setBroadcast, alertStore } = require('./routes/alerts');

// ── APP SETUP ──
const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve the frontend folder statically
// Access dashboard at http://localhost:3000
app.use(express.static(path.join(__dirname, '../frontend')));

// ── REST ROUTES ──
app.use('/api/simulation', simulationRouter);
app.use('/api/analytics',  analyticsRouter);
app.use('/api/alerts',     alertsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    time:    new Date().toISOString(),
    uptime:  process.uptime(),
    clients: wss.clients.size,
  });
});

// ── WEBSOCKET SERVER ──
const wss = new WebSocket.Server({ server });

// Give the alert engine a broadcast function for all clients
setBroadcast((payload) => broadcastToAll(payload));

function broadcastToAll(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// One SimulationEngine per connected WS client
const clientEngines = new Map();

wss.on('connection', (ws) => {
  console.log(`[WS] Client connected (total: ${wss.clients.size})`);

  ws.send(JSON.stringify({
    type:    'connected',
    message: 'OpsPulse stream ready. Send { type: "start_simulation", bizType: "retail" } to begin.',
  }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' })); }

    // ── START SIMULATION ──
    if (msg.type === 'start_simulation') {
      if (clientEngines.has(ws)) clientEngines.get(ws).stop();

      resetState();

      const bizType = msg.bizType || 'retail';
      console.log(`[WS] Starting ${bizType} simulation`);

      const engine = new SimulationEngine(bizType, (event) => {
        // Run through alert + analytics pipeline
        processEvent(event);

        // Send raw event to this specific client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      });

      clientEngines.set(ws, engine);
      await engine.start();

      ws.send(JSON.stringify({
        type:    'simulation_started',
        bizType,
        message: `Streaming ${bizType} data. Events every ~2–3 seconds.`,
      }));
    }

    else if (msg.type === 'pause') {
      clientEngines.get(ws)?.pause();
      ws.send(JSON.stringify({ type: 'paused' }));
    }

    else if (msg.type === 'resume') {
      clientEngines.get(ws)?.resume();
      ws.send(JSON.stringify({ type: 'resumed' }));
    }

    else if (msg.type === 'stop') {
      clientEngines.get(ws)?.stop();
      clientEngines.delete(ws);
      ws.send(JSON.stringify({ type: 'stopped' }));
    }

    // Client requests full current snapshot
    else if (msg.type === 'get_snapshot') {
      const analytics = require('./routes/analytics');
      ws.send(JSON.stringify({
        type:   'snapshot',
        kpis:   analytics.getKPIs(),
        stress: analytics.computeStress(),
        alerts: alertStore.alerts.slice(0, 20),
      }));
    }

    else {
      ws.send(JSON.stringify({ type: 'error', message: `Unknown: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (remaining: ${wss.clients.size})`);
    if (clientEngines.has(ws)) {
      clientEngines.get(ws).stop();
      clientEngines.delete(ws);
    }
  });

  ws.on('error', (err) => console.error('[WS] Error:', err.message));
});

// ── START ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║   OpsPulse Backend  — RUNNING      ║');
  console.log('╠════════════════════════════════════╣');
  console.log(`║  HTTP  →  http://localhost:${PORT}    ║`);
  console.log(`║  WS    →  ws://localhost:${PORT}      ║`);
  console.log(`║  UI    →  http://localhost:${PORT}    ║`);
  console.log('╚════════════════════════════════════╝\n');
  console.log('Key REST endpoints:');
  console.log('  POST /api/simulation/start  { bizType }');
  console.log('  GET  /api/simulation/poll');
  console.log('  GET  /api/analytics/summary');
  console.log('  GET  /api/analytics/stress');
  console.log('  GET  /api/alerts\n');
});