'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const stageController = require('../src/stage-controller');

function makeTmpCtx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-stage-test-'));
  const taskDir = path.join(tmp, 'Tasks');
  const logsDir = path.join(tmp, 'Logs');
  fs.mkdirSync(taskDir);
  fs.mkdirSync(logsDir);

  const sent = [];
  return {
    ctx: {
      entity: 'test',
      config: { taskDir },
      vaultDir: tmp,
      log: createLogger('test'),
      ipc: {
        send: (type, to, payload) => {
          const env = { id: `msg-${sent.length}`, type, to, payload };
          sent.push(env);
          return env;
        }
      }
    },
    sent,
    tmp
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('isValidProgression: demo -> testing is valid', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  assert.strictEqual(sc.isValidProgression('demo', 'testing'), true);
  cleanup(tmp);
});

test('isValidProgression: demo -> launch is invalid (skip)', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  assert.strictEqual(sc.isValidProgression('demo', 'launch'), false);
  cleanup(tmp);
});

test('isValidProgression: testing -> demo is invalid (backwards)', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  assert.strictEqual(sc.isValidProgression('testing', 'demo'), false);
  cleanup(tmp);
});

test('requestTransition sends stage-signal IPC', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  const result = sc.requestTransition('myapp', 'demo', 'testing');
  assert.strictEqual(result.sent, true);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].type, 'stage-signal');
  assert.strictEqual(sent[0].payload.fromStage, 'demo');
  assert.strictEqual(sent[0].payload.toStage, 'testing');
  cleanup(tmp);
});

test('requestTransition rejects invalid progression', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  const result = sc.requestTransition('myapp', 'demo', 'launch');
  assert.strictEqual(result.sent, false);
  assert.strictEqual(sent.length, 0);
  cleanup(tmp);
});

test('requestTransition rejects duplicate pending', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  const result = sc.requestTransition('myapp', 'demo', 'testing');
  assert.strictEqual(result.sent, false);
  assert.ok(result.reason.includes('pending'));
  cleanup(tmp);
});

test('requestTransition rejects stage mismatch', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  // Simulate ack to set current stage to testing
  sc.handleStageAck({
    payload: { status: 'success', app: 'myapp', fromStage: 'demo', toStage: 'testing', duration: '1s' }
  });
  // Now try transition from demo (wrong — current is testing)
  const result = sc.requestTransition('myapp', 'demo', 'testing');
  assert.strictEqual(result.sent, false);
  assert.ok(result.reason.includes('testing'));
  cleanup(tmp);
});

test('handleStageAck success updates stage', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  sc.handleStageAck({
    payload: { status: 'success', app: 'myapp', fromStage: 'demo', toStage: 'testing', duration: '5s' }
  });
  assert.strictEqual(sc.getStage('myapp'), 'testing');
  cleanup(tmp);
});

test('handleStageAck failure clears pending', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  sc.handleStageAck({
    payload: { status: 'failed', app: 'myapp', fromStage: 'demo', toStage: 'testing', reason: 'health check failed' }
  });
  assert.strictEqual(sc.getStage('myapp'), 'demo');
  // Can retry after failure
  const result = sc.requestTransition('myapp', 'demo', 'testing');
  assert.strictEqual(result.sent, true);
  cleanup(tmp);
});

test('state persists across re-init', () => {
  const { ctx, tmp } = makeTmpCtx();
  let sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  sc.handleStageAck({
    payload: { status: 'success', app: 'myapp', fromStage: 'demo', toStage: 'testing', duration: '2s' }
  });

  sc = stageController.init(ctx);
  assert.strictEqual(sc.getStage('myapp'), 'testing');
  cleanup(tmp);
});

test('logTransition writes to Logs/', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('myapp', 'demo', 'testing');
  sc.handleStageAck({
    payload: { status: 'success', app: 'myapp', fromStage: 'demo', toStage: 'testing', duration: '3s' }
  });
  const logFile = path.join(tmp, 'Logs', 'stage-transitions.md');
  assert.ok(fs.existsSync(logFile));
  const content = fs.readFileSync(logFile, 'utf8');
  assert.ok(content.includes('demo -> testing'));
  assert.ok(content.includes('success'));
  cleanup(tmp);
});

test('getAllStages returns state map', () => {
  const { ctx, tmp } = makeTmpCtx();
  const sc = stageController.init(ctx);
  sc.requestTransition('app1', 'demo', 'testing');
  sc.handleStageAck({
    payload: { status: 'success', app: 'app1', fromStage: 'demo', toStage: 'testing', duration: '1s' }
  });
  const stages = sc.getAllStages();
  assert.strictEqual(stages.app1.stage, 'testing');
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
  console.log(`\nStage Controller: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
