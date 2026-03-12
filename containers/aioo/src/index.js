'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('./logger');
const { ensureDir } = require('./util');
const { createEventLoop } = require('./event-loop');
const ipcHandler = require('./ipc-handler');
const taskGraph = require('./task-graph');
const healthMonitor = require('./health-monitor');
const brainClient = require('./brain-client');
const hitlManager = require('./hitl-manager');
const stageController = require('./stage-controller');
const costTracker = require('./cost-tracker');

// ── Config ───────────────────────────────────────────────────────────

const entity = process.env.ENTITY;
if (!entity) {
  console.error('[FATAL] ENTITY env var required');
  process.exit(1);
}

const DEFAULTS = { pollIntervalMs: 1000, healthIntervalMs: 15000 };

function loadConfig() {
  const configPath = '/config/aioo.json';
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────

const config = loadConfig();
const log = createLogger(entity);

const ipcInDir = '/ipc/from-paw';
const ipcOutDir = '/ipc/to-paw';
const vaultDir = '/vault';

// Ensure directories
ensureDir(path.join(ipcInDir, 'processed'));
ensureDir(path.join(ipcOutDir, 'processed'));
ensureDir(path.join(vaultDir, 'Tasks'));

log.info('daemon', `AIOO starting for entity: ${entity}`);
log.info('daemon', `AI Gateway: ${process.env.AI_GATEWAY_URL || 'not set'}`);
log.info('daemon', `Chronicle: ${process.env.CHRONICLE_URL || 'not set'}`);

// ── Init Modules ─────────────────────────────────────────────────────

const ctx = { entity, config, ipcInDir, ipcOutDir, vaultDir, log };

// IPC first (other modules use ctx.ipc.send)
const ipc = ipcHandler.init(ctx);
ctx.ipc = ipc;

const health = healthMonitor.init(ctx);
const tasks = taskGraph.init(ctx);
const brain = brainClient.init(ctx);
const hitl = hitlManager.init(ctx);
const stage = stageController.init(ctx);
const cost = costTracker.init(ctx);

// ── Message Handlers ─────────────────────────────────────────────────

const handlers = {
  'agent-report': (env) => {
    cost.handleAgentReport(env);
    // Future: update task graph based on agent result
  },
  'stage-ack': (env) => stage.handleStageAck(env),
  'human-message': (env) => hitl.handleHumanMessage(env),
  'health-ping': (env) => health.handlePing(env)
};

// ── Event Loop ───────────────────────────────────────────────────────

const loop = createEventLoop(ctx, handlers);
loop.start();

log.info('daemon', `AIOO daemon running for entity: ${entity}`);

// ── Graceful Shutdown ────────────────────────────────────────────────

function shutdown(signal) {
  log.info('daemon', `Received ${signal}, shutting down...`);
  loop.stop();
  health.stop();
  tasks.flush();
  log.info('daemon', 'AIOO daemon stopped');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
