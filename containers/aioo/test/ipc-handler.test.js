'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const ipcHandler = require('../src/ipc-handler');

const ipcLibPath = process.env.IPC_LIB_PATH
  ? path.resolve(process.env.IPC_LIB_PATH)
  : '/app/lib/ipc';

function makeTmpCtx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-ipc-test-'));
  const ipcIn = path.join(tmp, 'from-paw');
  const ipcOut = path.join(tmp, 'to-paw');
  fs.mkdirSync(ipcIn);
  fs.mkdirSync(path.join(ipcIn, 'processed'));
  fs.mkdirSync(ipcOut);
  fs.mkdirSync(path.join(ipcOut, 'processed'));

  return {
    ctx: {
      entity: 'test',
      config: {},
      ipcInDir: ipcIn,
      ipcOutDir: ipcOut,
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

test('send creates envelope in outDir', () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipc = ipcHandler.init(ctx);
  ipc.send('spawn-agent', 'nanoclaw-paw', { task: 'test' });

  const files = fs.readdirSync(ctx.ipcOutDir).filter(f => f.endsWith('.json'));
  assert.strictEqual(files.length, 1);

  const envelope = JSON.parse(fs.readFileSync(path.join(ctx.ipcOutDir, files[0]), 'utf8'));
  assert.strictEqual(envelope.type, 'spawn-agent');
  assert.strictEqual(envelope.from, 'aioo-test');
  assert.strictEqual(envelope.to, 'nanoclaw-paw');
  assert.deepStrictEqual(envelope.payload, { task: 'test' });
  cleanup(tmp);
});

test('send includes replyTo when provided', () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipc = ipcHandler.init(ctx);
  ipc.send('human-reply', 'nanoclaw-paw', { text: 'yes' }, 'msg-123');

  const files = fs.readdirSync(ctx.ipcOutDir).filter(f => f.endsWith('.json'));
  const envelope = JSON.parse(fs.readFileSync(path.join(ctx.ipcOutDir, files[0]), 'utf8'));
  assert.strictEqual(envelope.replyTo, 'msg-123');
  cleanup(tmp);
});

test('readIncoming reads messages from inDir', () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipc = ipcHandler.init(ctx);

  // Write a message directly into inDir using the IPC lib
  const ipcLib = require(ipcLibPath);
  const env = ipcLib.createEnvelope('agent-report', 'nanoclaw-paw', 'aioo-test', { status: 'completed' });
  ipcLib.writeMessage(ctx.ipcInDir, env);

  const messages = ipc.readIncoming();
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].envelope.type, 'agent-report');
  cleanup(tmp);
});

test('markProcessed moves message to processed/', () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipc = ipcHandler.init(ctx);

  const ipcLib = require(ipcLibPath);
  const env = ipcLib.createEnvelope('health-ping', 'watchdog', 'aioo-test', {});
  ipcLib.writeMessage(ctx.ipcInDir, env);

  const messages = ipc.readIncoming();
  ipc.markProcessed(messages[0].file);

  const remaining = fs.readdirSync(ctx.ipcInDir).filter(f => f.endsWith('.json'));
  assert.strictEqual(remaining.length, 0);

  const processed = fs.readdirSync(path.join(ctx.ipcInDir, 'processed'));
  assert.strictEqual(processed.length, 1);
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
  console.log(`\nIPC Handler: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
