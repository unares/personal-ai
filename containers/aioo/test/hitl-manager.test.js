'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const hitlManager = require('../src/hitl-manager');

function makeTmpCtx(configOverride = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-hitl-test-'));
  const sent = [];
  return {
    ctx: {
      entity: 'test',
      config: { ...configOverride },
      vaultDir: tmp,
      log: createLogger('test'),
      ipc: {
        send: (type, to, payload) => {
          sent.push({ type, to, payload });
          return { id: `msg-${sent.length}` };
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

test('selectTier returns correct default tier', () => {
  const { ctx, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  assert.strictEqual(hitl.selectTier('stage-transition'), 'micro');
  assert.strictEqual(hitl.selectTier('define-outcomes'), 'light');
  assert.strictEqual(hitl.selectTier('debug-agents'), 'heavy');
  cleanup(tmp);
});

test('selectTier returns micro for unknown situation', () => {
  const { ctx, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  assert.strictEqual(hitl.selectTier('completely-unknown'), 'micro');
  cleanup(tmp);
});

test('selectTier respects config overrides', () => {
  const { ctx, tmp } = makeTmpCtx({
    hitlRules: { 'stage-transition': 'heavy' }
  });
  const hitl = hitlManager.init(ctx);
  assert.strictEqual(hitl.selectTier('stage-transition'), 'heavy');
  cleanup(tmp);
});

test('escalate only goes UP', () => {
  const { ctx, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  assert.strictEqual(hitl.escalate('micro', 'heavy'), 'heavy');
  assert.strictEqual(hitl.escalate('micro', 'light'), 'light');
  assert.strictEqual(hitl.escalate('light', 'heavy'), 'heavy');
  cleanup(tmp);
});

test('escalate never goes DOWN', () => {
  const { ctx, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  assert.strictEqual(hitl.escalate('heavy', 'micro'), 'heavy');
  assert.strictEqual(hitl.escalate('heavy', 'light'), 'heavy');
  assert.strictEqual(hitl.escalate('light', 'micro'), 'light');
  cleanup(tmp);
});

test('request sends human-reply IPC', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  hitl.request('micro', 'Stage ready', 'task-1');
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].type, 'human-reply');
  assert.strictEqual(sent[0].to, 'nanoclaw-paw');
  assert.strictEqual(sent[0].payload.hitlTier, 'micro');
  assert.ok(sent[0].payload.text.includes('Stage ready'));
  cleanup(tmp);
});

test('request includes entity prefix in message', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  hitl.request('light', 'Define outcomes', null);
  assert.ok(sent[0].payload.text.startsWith('[test]'));
  cleanup(tmp);
});

test('requestForSituation uses rules to select tier', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  hitl.requestForSituation('entity-setup', 'First setup', null);
  assert.strictEqual(sent[0].payload.hitlTier, 'heavy');
  cleanup(tmp);
});

test('handleHumanMessage returns acknowledged', () => {
  const { ctx, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  const result = hitl.handleHumanMessage({
    from: 'nanoclaw-paw',
    payload: { channel: 'whatsapp', human: 'michal', text: 'Yes proceed' }
  });
  assert.strictEqual(result.acknowledged, true);
  assert.strictEqual(result.text, 'Yes proceed');
  cleanup(tmp);
});

test('request echoes chatId and channel from last human-message', () => {
  const { ctx, sent, tmp } = makeTmpCtx();
  const hitl = hitlManager.init(ctx);
  hitl.handleHumanMessage({
    from: 'nanoclaw-paw',
    payload: { channel: 'telegram-aioo-procenteo', human: 'michal', text: 'Go', chatId: '12345678' }
  });
  hitl.request('micro', 'Acknowledged', null);
  assert.strictEqual(sent[0].payload.channel, 'telegram-aioo-procenteo');
  assert.strictEqual(sent[0].payload.chatId, '12345678');
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
  console.log(`\nHITL Manager: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
