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

// ── T9-T10: debug-prompt handler ────────────────────────────────────

test('T9: debug-prompt handler returns debug-prompt-response with metadata', () => {
  const { ctx, tmp } = makeTmpCtx();
  const ipc = ipcHandler.init(ctx);

  // Mock brain.getPromptInfo on ctx
  ctx.brain = {
    getPromptInfo: () => ({
      hash: 'sha256:abc123',
      prompt: 'test prompt',
      files: { SOUL: 'found', IDENTITY: 'found', NORTHSTAR: 'found', GLOSSARY: 'found', CLAUDE: 'found' },
      language: 'pl',
      assembledAt: '2026-03-14T12:00:00.000Z',
    })
  };

  // Simulate debug-prompt handling (same as index.js handler)
  const ipcLib = require(ipcLibPath);
  const inbound = ipcLib.createEnvelope('debug-prompt', 'nanoclaw-paw', 'aioo-test', {});

  const info = ctx.brain.getPromptInfo();
  ipc.send('debug-prompt-response', inbound.from, info, inbound.id);

  const files = fs.readdirSync(ctx.ipcOutDir).filter(f => f.endsWith('.json'));
  assert.strictEqual(files.length, 1);

  const response = JSON.parse(fs.readFileSync(path.join(ctx.ipcOutDir, files[0]), 'utf8'));
  assert.strictEqual(response.type, 'debug-prompt-response');
  assert.strictEqual(response.payload.hash, 'sha256:abc123');
  assert.strictEqual(response.payload.language, 'pl');
  assert.ok(response.payload.assembledAt);
  assert.ok(response.payload.prompt);
  assert.ok(response.replyTo);
  cleanup(tmp);
});

test('T10: debug-prompt response files field lists all 5 keys with status', () => {
  const { ctx, tmp } = makeTmpCtx();
  ipcHandler.init(ctx);

  ctx.brain = {
    getPromptInfo: () => ({
      hash: 'sha256:def456',
      prompt: 'test',
      files: { SOUL: 'found', IDENTITY: 'missing', NORTHSTAR: 'found', GLOSSARY: 'found', CLAUDE: 'missing' },
      language: null,
      assembledAt: '2026-03-14T12:00:00.000Z',
    })
  };

  const info = ctx.brain.getPromptInfo();
  const expectedKeys = ['SOUL', 'IDENTITY', 'NORTHSTAR', 'GLOSSARY', 'CLAUDE'];
  for (const key of expectedKeys) {
    assert.ok(key in info.files, `Missing key: ${key}`);
    assert.ok(['found', 'missing'].includes(info.files[key]), `Invalid status for ${key}`);
  }
  assert.strictEqual(info.files.IDENTITY, 'missing');
  assert.strictEqual(info.files.CLAUDE, 'missing');
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
  console.log(`\nIPC Handler (+ debug-prompt): ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
