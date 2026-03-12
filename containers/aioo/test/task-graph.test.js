'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const taskGraph = require('../src/task-graph');

function makeTmpCtx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-task-test-'));
  const taskDir = path.join(tmp, 'Tasks');
  return {
    entity: 'test',
    config: { taskDir },
    vaultDir: tmp,
    log: createLogger('test')
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('create returns task with pending status', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Test task');
  assert.strictEqual(task.status, 'pending');
  assert.ok(task.id);
  assert.ok(task.createdAt);
  cleanup(ctx.vaultDir);
});

test('get retrieves task by id', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Find me');
  const found = tg.get(task.id);
  assert.strictEqual(found.title, 'Find me');
  cleanup(ctx.vaultDir);
});

test('get returns null for unknown id', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  assert.strictEqual(tg.get('nonexistent'), null);
  cleanup(ctx.vaultDir);
});

test('list returns all active tasks', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  tg.create('One');
  tg.create('Two');
  assert.strictEqual(tg.list().length, 2);
  cleanup(ctx.vaultDir);
});

test('list filters by status', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  tg.create('Pending one');
  const t2 = tg.create('Will activate');
  tg.transition(t2.id, 'active');
  assert.strictEqual(tg.list('pending').length, 1);
  assert.strictEqual(tg.list('active').length, 1);
  cleanup(ctx.vaultDir);
});

test('transition pending -> active works', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Activate me');
  const updated = tg.transition(task.id, 'active');
  assert.strictEqual(updated.status, 'active');
  cleanup(ctx.vaultDir);
});

test('transition active -> completed moves to completed', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Complete me');
  tg.transition(task.id, 'active');
  tg.transition(task.id, 'completed', { result: 'Done' });
  assert.strictEqual(tg.list().length, 0);
  const found = tg.get(task.id);
  assert.strictEqual(found.status, 'completed');
  assert.strictEqual(found.result, 'Done');
  cleanup(ctx.vaultDir);
});

test('transition active -> failed moves to completed with error', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Fail me');
  tg.transition(task.id, 'active');
  tg.transition(task.id, 'failed', { error: 'Timeout' });
  const found = tg.get(task.id);
  assert.strictEqual(found.status, 'failed');
  assert.strictEqual(found.error, 'Timeout');
  cleanup(ctx.vaultDir);
});

test('illegal transition throws', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Bad transition');
  tg.transition(task.id, 'active');
  tg.transition(task.id, 'completed');
  assert.throws(() => tg.transition(task.id, 'active'), /Task not found/);
  cleanup(ctx.vaultDir);
});

test('pending -> completed is illegal', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Skip active');
  assert.throws(() => tg.transition(task.id, 'completed'), /Invalid transition/);
  cleanup(ctx.vaultDir);
});

test('state persists across re-init', () => {
  const ctx = makeTmpCtx();
  let tg = taskGraph.init(ctx);
  const task = tg.create('Persist me');
  tg.transition(task.id, 'active');

  // Re-init from same directory
  tg = taskGraph.init(ctx);
  const found = tg.get(task.id);
  assert.strictEqual(found.status, 'active');
  assert.strictEqual(found.title, 'Persist me');
  cleanup(ctx.vaultDir);
});

test('history records all transitions', () => {
  const ctx = makeTmpCtx();
  const tg = taskGraph.init(ctx);
  const task = tg.create('Track history');
  tg.transition(task.id, 'active');
  tg.transition(task.id, 'completed');

  const histPath = path.join(ctx.config.taskDir, 'history.json');
  const history = JSON.parse(fs.readFileSync(histPath, 'utf8'));
  const taskEvents = history.filter(e => e.taskId === task.id);
  assert.strictEqual(taskEvents.length, 3); // pending, active, completed
  cleanup(ctx.vaultDir);
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
  console.log(`\nTask Graph: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
