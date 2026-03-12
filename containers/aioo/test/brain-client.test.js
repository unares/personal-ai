'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const brainClient = require('../src/brain-client');

function makeTmpCtx(envOverride = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-brain-test-'));

  // Save and override env
  const savedEnv = {};
  for (const [k, v] of Object.entries(envOverride)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  const tracked = [];
  return {
    ctx: {
      entity: 'test',
      config: { brainModel: 'gemini-planning', brainClassifierModel: 'gemini-classifier' },
      vaultDir: tmp,
      log: createLogger('test'),
      cost: { track: (source, tokens) => tracked.push({ source, tokens }) }
    },
    tracked,
    tmp,
    restore: () => {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ────────────────────────────────────────────────────────────

test('judge returns no-op when gateway not configured', async () => {
  const { ctx, tmp, restore } = makeTmpCtx({ AI_GATEWAY_URL: undefined });
  const brain = brainClient.init(ctx);
  const result = await brain.judge('What should I do?', {});
  assert.strictEqual(result.decision, 'no-op');
  assert.strictEqual(result.tokens, 0);
  restore();
  cleanup(tmp);
});

test('classify returns unknown when gateway not configured', async () => {
  const { ctx, tmp, restore } = makeTmpCtx({ AI_GATEWAY_URL: undefined });
  const brain = brainClient.init(ctx);
  const result = await brain.classify('Is this important?');
  assert.strictEqual(result.category, 'unknown');
  assert.strictEqual(result.tokens, 0);
  restore();
  cleanup(tmp);
});

test('judge returns error on gateway failure', async () => {
  // Point to a non-existent gateway to trigger connection error
  const { ctx, tmp, restore } = makeTmpCtx({ AI_GATEWAY_URL: 'http://localhost:19999' });
  const brain = brainClient.init(ctx);
  const result = await brain.judge('Test prompt', {});
  assert.strictEqual(result.decision, 'error');
  assert.strictEqual(result.tokens, 0);
  restore();
  cleanup(tmp);
});

test('classify returns error on gateway failure', async () => {
  const { ctx, tmp, restore } = makeTmpCtx({ AI_GATEWAY_URL: 'http://localhost:19999' });
  const brain = brainClient.init(ctx);
  const result = await brain.classify('Test classify');
  assert.strictEqual(result.category, 'error');
  assert.strictEqual(result.tokens, 0);
  restore();
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
  console.log(`\nBrain Client: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
