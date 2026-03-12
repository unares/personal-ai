'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const healthMonitor = require('../src/health-monitor');

function makeTmpCtx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-health-test-'));
  const ipcIn = path.join(tmp, 'from-paw');
  const ipcOut = path.join(tmp, 'to-paw');
  fs.mkdirSync(ipcIn);
  fs.mkdirSync(ipcOut);

  const sent = [];
  return {
    ctx: {
      entity: 'test',
      config: { healthIntervalMs: 60000 }, // long interval, we test manually
      ipcInDir: ipcIn,
      ipcOutDir: ipcOut,
      vaultDir: tmp,
      log: createLogger('test'),
      ipc: { send: (type, to, payload, replyTo) => sent.push({ type, to, payload, replyTo }) }
    },
    sent,
    tmp
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  try { fs.unlinkSync('/tmp/alive'); } catch (e) { /* ignore */ }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('writes /tmp/alive on init', () => {
  const { ctx, tmp } = makeTmpCtx();
  const health = healthMonitor.init(ctx);
  assert.ok(fs.existsSync('/tmp/alive'));
  health.stop();
  cleanup(tmp);
});

test('check returns healthy status', () => {
  const { ctx, tmp } = makeTmpCtx();
  const health = healthMonitor.init(ctx);
  const status = health.check();
  assert.strictEqual(status.status, 'healthy');
  assert.ok(status.uptime >= 0);
  assert.strictEqual(status.checks.ipcReadable, true);
  assert.strictEqual(status.checks.ipcWritable, true);
  assert.strictEqual(status.checks.vaultWritable, true);
  health.stop();
  cleanup(tmp);
});

test('check returns degraded when ipc dir missing', () => {
  const { ctx, tmp } = makeTmpCtx();
  const health = healthMonitor.init(ctx);
  fs.rmSync(ctx.ipcInDir, { recursive: true });
  const status = health.check();
  assert.strictEqual(status.status, 'degraded');
  assert.strictEqual(status.checks.ipcReadable, false);
  health.stop();
  cleanup(tmp);
});

test('handlePing sends health-pong', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const health = healthMonitor.init(ctx);
  health.handlePing({ id: 'ping-123', from: 'watchdog' });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].type, 'health-pong');
  assert.strictEqual(sent[0].to, 'watchdog');
  assert.strictEqual(sent[0].replyTo, 'ping-123');
  assert.ok(sent[0].payload.status);
  health.stop();
  cleanup(tmp);
});

test('stop removes /tmp/alive', () => {
  const { ctx, tmp } = makeTmpCtx();
  const health = healthMonitor.init(ctx);
  assert.ok(fs.existsSync('/tmp/alive'));
  health.stop();
  assert.ok(!fs.existsSync('/tmp/alive'));
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
  console.log(`\nHealth Monitor: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
