// ═══════════════════════════════════════════════
//  OPSPULSE — SIMULATION ENGINE
//  Reads CSV files and streams rows as live events
// ═══════════════════════════════════════════════

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');

const router = express.Router();

// ── DATA DIRECTORY ──
const DATA_DIR = path.join(__dirname, '../data');

// ══════════════════════════════════════════════
//  SIMULATION ENGINE CLASS
//  Used by WebSocket server to stream events
// ══════════════════════════════════════════════

class SimulationEngine {
  constructor(bizType, onEvent) {
    this.bizType   = bizType;
    this.onEvent   = onEvent;      // callback(event) fired per event
    this.paused    = false;
    this.running   = false;
    this.interval  = null;

    // Loaded dataset rows
    this.salesRows     = [];
    this.inventoryRows = [];
    this.ticketRows    = [];

    // Pointers (cycle through rows)
    this.salesIdx     = 0;
    this.inventoryIdx = 0;
    this.ticketIdx    = 0;

    // Simulated clock
    this.simHour   = 10;
    this.simMinute = 0;
    this.tickCount = 0;
  }

  // ── LOAD CSV FILES ──
  async load() {
    const dir = path.join(DATA_DIR, this.bizType);
    this.salesRows     = await readCSV(path.join(dir, 'sales.csv'));
    this.inventoryRows = await readCSV(path.join(dir, 'inventory.csv'));
    this.ticketRows    = await readCSV(path.join(dir, 'tickets.csv'));
    console.log(`[SimEngine] Loaded ${this.bizType}: ${this.salesRows.length} sales, ${this.inventoryRows.length} inventory, ${this.ticketRows.length} tickets`);
  }

  // ── START STREAMING ──
  async start() {
    await this.load();
    this.running = true;

    // Emit initial inventory snapshot
    this.emitInventorySnapshot();

    // Stream events every 2-3 seconds
    this.interval = setInterval(() => {
      if (!this.paused && this.running) {
        this.emitNextEvent();
      }
    }, this._randomInterval());
  }

  // ── STOP ──
  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  pause()  { this.paused = true; }
  resume() { this.paused = false; }

  // ── EMIT INITIAL INVENTORY ──
  emitInventorySnapshot() {
    const snapshot = {};
    this.inventoryRows.forEach(row => {
      snapshot[row.product] = parseInt(row.stock) || 0;
    });
    this.onEvent({
      type:      'inventory_snapshot',
      inventory: snapshot,
      time:      this._currentTime(),
    });
  }

  // ── EMIT NEXT EVENT ──
  // Cycles through: sale → sale → inventory → sale → ticket → sale...
  emitNextEvent() {
    this.tickCount++;
    this._advanceTime();

    const rand = Math.random();
    let event;

    if (rand < 0.55) {
      // SALE EVENT
      event = this._nextSaleEvent();
    } else if (rand < 0.75) {
      // INVENTORY CHANGE EVENT
      event = this._nextInventoryEvent();
    } else {
      // SUPPORT TICKET EVENT
      event = this._nextTicketEvent();
    }

    if (event) {
      event.time = this._currentTime();
      this.onEvent(event);
    }

    // Reset interval to vary timing
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = setInterval(() => {
        if (!this.paused && this.running) this.emitNextEvent();
      }, this._randomInterval());
    }
  }

  _nextSaleEvent() {
    if (this.salesRows.length === 0) return null;
    const row = this.salesRows[this.salesIdx % this.salesRows.length];
    this.salesIdx++;
    return {
      type:    'sale',
      product: row.product,
      amount:  parseFloat(row.amount) || 0,
    };
  }

  _nextInventoryEvent() {
    if (this.inventoryRows.length === 0) return null;
    const row = this.inventoryRows[this.inventoryIdx % this.inventoryRows.length];
    this.inventoryIdx++;
    // Simulate a small stock decrease on each event
    const change = -(Math.floor(Math.random() * 3) + 1);
    return {
      type:    'inventory',
      product: row.product,
      stock:   parseInt(row.stock) || 0,
      change,
    };
  }

  _nextTicketEvent() {
    if (this.ticketRows.length === 0) return null;
    const row = this.ticketRows[this.ticketIdx % this.ticketRows.length];
    this.ticketIdx++;
    return {
      type:   'ticket',
      id:     row.ticket_id || (1000 + this.ticketIdx),
      issue:  row.issue,
      status: row.status,
    };
  }

  _currentTime() {
    return String(this.simHour).padStart(2, '0') + ':' +
           String(this.simMinute).padStart(2, '0');
  }

  _advanceTime() {
    this.simMinute += 2;
    if (this.simMinute >= 60) {
      this.simMinute = 0;
      this.simHour   = (this.simHour + 1) % 24;
    }
  }

  _randomInterval() {
    return 2000 + Math.floor(Math.random() * 1500); // 2.0 – 3.5 seconds
  }
}

// ══════════════════════════════════════════════
//  CSV HELPER
// ══════════════════════════════════════════════

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    if (!fs.existsSync(filePath)) {
      console.warn(`[CSV] File not found: ${filePath}, using empty dataset`);
      return resolve([]);
    }
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

// ══════════════════════════════════════════════
//  REST ENDPOINTS
//  For clients who prefer polling over WebSocket
// ══════════════════════════════════════════════

// In-memory store for REST-mode (single global session)
let restEngine  = null;
let restBuffer  = [];   // buffered events for polling
const MAX_BUFFER = 50;

// POST /api/simulation/start  { bizType: 'retail' }
router.post('/start', async (req, res) => {
  const { bizType = 'retail' } = req.body;

  if (restEngine) restEngine.stop();
  restBuffer = [];

  restEngine = new SimulationEngine(bizType, (event) => {
    restBuffer.unshift(event);
    if (restBuffer.length > MAX_BUFFER) restBuffer.pop();
  });

  await restEngine.start();
  res.json({ success: true, message: `Simulation started for ${bizType}` });
});

// GET /api/simulation/next  → returns latest buffered event
router.get('/next', (req, res) => {
  if (!restEngine) {
    return res.status(400).json({ error: 'No simulation running. POST /api/simulation/start first.' });
  }
  const event = restBuffer.shift() || null;
  res.json({ event });
});

// GET /api/simulation/poll  → returns all buffered events since last poll
router.get('/poll', (req, res) => {
  if (!restEngine) {
    return res.status(400).json({ error: 'No simulation running.' });
  }
  const events = [...restBuffer];
  restBuffer   = [];
  res.json({ events, count: events.length });
});

// POST /api/simulation/pause
router.post('/pause', (req, res) => {
  restEngine?.pause();
  res.json({ success: true, status: 'paused' });
});

// POST /api/simulation/resume
router.post('/resume', (req, res) => {
  restEngine?.resume();
  res.json({ success: true, status: 'running' });
});

// POST /api/simulation/stop
router.post('/stop', (req, res) => {
  restEngine?.stop();
  restEngine = null;
  restBuffer = [];
  res.json({ success: true, status: 'stopped' });
});

// GET /api/simulation/status
router.get('/status', (req, res) => {
  res.json({
    running:    !!restEngine && restEngine.running,
    paused:     restEngine?.paused || false,
    bizType:    restEngine?.bizType || null,
    tickCount:  restEngine?.tickCount || 0,
    buffered:   restBuffer.length,
  });
});

module.exports = router;
module.exports.SimulationEngine = SimulationEngine;