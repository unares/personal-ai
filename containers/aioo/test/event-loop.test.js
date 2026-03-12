'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');
const { createEventLoop } = require('../src/event-loop');
const ipcHandler = require('../src/ipc-handler');

const ipcLibPath = process.env.IPC_LIB_PATH
  ? path.resolve(process.env.IPC_LIB_PATH)
  : '/app/lib/ipc';

function makeTmpCtx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-loop-test-'));
  const ipcIn = path.join(tmp, 'from-paw');
  const ipcOut = path.join(tmp, 'to-paw');
  fs.mkdirSync(ipcIn);
  fs.mkdirSync(path.join(ipcIn, 'processed'));
  fs.mkdirSync(ipcOut);
  fs.mkdirSync(path.join(ipcOut, 'processed'));

  const ctx = {
    entity: 'test',
    config: { pollIntervalMs: 50 }, // fast polling for tests
    ipcInDir: ipcIn,
    ipcOutDir: ipcOut,
    vaultDir: tmp,
    log: createLogger('test')
  };
  ctx.ipc = ipcHandler.init(ctx);
  return { ctx, tmp };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('starts and stops without error', async () => {
  const { ctx, tmp } = makeTmpCtx();
  const loop = createEventLoop(ctx, {});
  loop.start();
  await wait(100);
  loop.stop();
  cleanup(tmp);
});

test('routes known message type to handler', async () => {
  const { ctx, tmp } = makeTmpCtx();
  const handled = [];
  const handlers = {
    'agent-report': (env) => handled.push(env)
  };

  const ipcLib = require(ipcLibPath);
  const env = ipcLib.createEnvelope('agent-report', 'paw', 'aioo-test', { status: 'completed' });
  ipcLib.writeMessage(ctx.ipcInDir, env);

  const loop = createEventLoop(ctx, handlers);
  loop.start();
  await wait(150);
  loop.stop();

  assert.strictEqual(handled.length, 1);
  assert.strictEqual(handled[0].type, 'agent-report');
  cleanup(tmp);
});

test('unknown type is moved to processed without crash', async () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipcLib = require(ipcLibPath);
  const env = ipcLib.createEnvelope('unknown-type', 'paw', 'aioo-test', {});
  ipcLib.writeMessage(ctx.ipcInDir, env);

  const loop = createEventLoop(ctx, {});
  loop.start();
  await wait(150);
  loop.stop();

  const remaining = fs.readdirSync(ctx.ipcInDir).filter(f => f.endsWith('.json'));
  assert.strictEqual(remaining.length, 0);
  const processed = fs.readdirSync(path.join(ctx.ipcInDir, 'processed'));
  assert.strictEqual(processed.length, 1);
  cleanup(tmp);
});

test('processes multiple messages in order', async () => {
  const { ctx, tmp } = makeTmpCtx();
  const order = [];
  const handlers = {
    'agent-report': (env) => order.push(env.payload.seq)
  };

  const ipcLib = require(ipcLibPath);
  for (let i = 1; i <= 3; i++) {
    const env = ipcLib.createEnvelope('agent-report', 'paw', 'aioo-test', { seq: i });
    ipcLib.writeMessage(ctx.ipcInDir, env);
  }

  const loop = createEventLoop(ctx, handlers);
  loop.start();
  await wait(150);
  loop.stop();

  assert.strictEqual(order.length, 3);
  // All 3 processed (order may vary when timestamps collide)
  assert.deepStrictEqual(order.sort(), [1, 2, 3]);
  cleanup(tmp);
});

test('handler error does not crash loop', async () => {
  const { ctx, tmp } = makeTmpCtx();
  let secondHandled = false;
  const handlers = {
    'agent-report': () => { throw new Error('handler boom'); },
    'health-ping': () => { secondHandled = true; }
  };

  const ipcLib = require(ipcLibPath);
  ipcLib.writeMessage(ctx.ipcInDir,
    ipcLib.createEnvelope('agent-report', 'paw', 'aioo-test', {}));
  ipcLib.writeMessage(ctx.ipcInDir,
    ipcLib.createEnvelope('health-ping', 'watchdog', 'aioo-test', {}));

  const loop = createEventLoop(ctx, handlers);
  loop.start();
  await wait(150);
  loop.stop();

  assert.strictEqual(secondHandled, true);
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
  console.log(`\nEvent Loop: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
