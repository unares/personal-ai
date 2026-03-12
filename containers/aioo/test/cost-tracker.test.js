'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const costTracker = require('../src/cost-tracker');

function makeTmpCtx(extraConfig = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-cost-test-'));
  const logsDir = path.join(tmp, 'Logs');
  fs.mkdirSync(logsDir);

  return {
    ctx: {
      entity: 'test',
      config: { ...extraConfig },
      vaultDir: tmp,
      log: createLogger('test')
    },
    tmp
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('track brain tokens', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.track('brain', 100);
  cost.track('brain', 50);
  const s = cost.getSummary();
  assert.strictEqual(s.brain, 150);
  assert.strictEqual(s.total, 150);
  cleanup(tmp);
});

test('track agent tokens', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.track('agents', 200);
  const s = cost.getSummary();
  assert.strictEqual(s.agents, 200);
  cleanup(tmp);
});

test('handleAgentReport extracts tokens and stage', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.handleAgentReport({
    payload: { tokens: 500, stage: 'demo', status: 'completed' }
  });
  const s = cost.getSummary();
  assert.strictEqual(s.agents, 500);
  assert.strictEqual(s.byStage.demo, 500);
  cleanup(tmp);
});

test('handleAgentReport handles missing stage', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.handleAgentReport({
    payload: { tokens: 100, status: 'completed' }
  });
  const s = cost.getSummary();
  assert.strictEqual(s.agents, 100);
  assert.strictEqual(s.byStage.demo, 0);
  cleanup(tmp);
});

test('getSummary amortizes brain cost across apps', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.track('brain', 1000);
  const s = cost.getSummary(2);
  assert.strictEqual(s.amortizedPerApp, 500);
  assert.strictEqual(s.activeApps, 2);
  cleanup(tmp);
});

test('state persists across re-init', () => {
  const { ctx, tmp } = makeTmpCtx();
  let cost = costTracker.init(ctx);
  cost.track('brain', 300);
  cost.track('agents', 700);

  cost = costTracker.init(ctx);
  const s = cost.getSummary();
  assert.strictEqual(s.brain, 300);
  assert.strictEqual(s.agents, 700);
  assert.strictEqual(s.total, 1000);
  cleanup(tmp);
});

test('budget alert triggers hitl when exceeded', () => {
  const hitlCalls = [];
  const { ctx, tmp } = makeTmpCtx({ dailyBudgetTokens: 100 });
  ctx.hitl = {
    requestForSituation: (situation, msg, taskId) => {
      hitlCalls.push({ situation, msg, taskId });
    }
  };
  const cost = costTracker.init(ctx);
  cost.track('brain', 50);
  assert.strictEqual(hitlCalls.length, 0);
  cost.track('brain', 60);
  assert.strictEqual(hitlCalls.length, 1);
  assert.strictEqual(hitlCalls[0].situation, 'budget-alert');
  cleanup(tmp);
});

test('costs directory created in Logs/', () => {
  const { ctx, tmp } = makeTmpCtx();
  costTracker.init(ctx);
  assert.ok(fs.existsSync(path.join(tmp, 'Logs', 'costs')));
  cleanup(tmp);
});

test('current.json persisted after track', () => {
  const { ctx, tmp } = makeTmpCtx();
  const cost = costTracker.init(ctx);
  cost.track('brain', 42);
  const statePath = path.join(tmp, 'Logs', 'costs', 'current.json');
  assert.ok(fs.existsSync(statePath));
  const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(data.brain, 42);
  cleanup(tmp);
});

// ── Runner ───────────────────────────────────────────────────────────

async function run() {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  PASS  ${t.name}`);
      pass++;
    } catch (e) {
      console.error(`  FAIL  ${t.name}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nCost Tracker: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
