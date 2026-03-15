'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  makeTmpCtx,
  createIdentityDir,
  writeIdentityFiles,
  patchPaths,
  cleanup,
  brainClient,
  createLogger,
} = require('./brain-test-helpers');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── T1: assemblePrompt with all 5 files ─────────────────────────────

test('T1: assemblePrompt with all 5 files returns ordered prompt + hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t1-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', {}, log);

  assert.ok(result.prompt.includes('# Shared Personality'));
  assert.ok(result.prompt.includes('# Companion Identity'));
  assert.ok(result.prompt.includes('# Entity Vision'));
  assert.ok(result.prompt.includes('# Entity Terminology'));
  assert.ok(result.prompt.includes('# Operational Context'));

  // Verify order: SOUL before IDENTITY before NORTHSTAR etc.
  const soulIdx = result.prompt.indexOf('Shared Personality');
  const identityIdx = result.prompt.indexOf('Companion Identity');
  const northstarIdx = result.prompt.indexOf('Entity Vision');
  const glossaryIdx = result.prompt.indexOf('Entity Terminology');
  const claudeIdx = result.prompt.indexOf('Operational Context');
  assert.ok(soulIdx < identityIdx);
  assert.ok(identityIdx < northstarIdx);
  assert.ok(northstarIdx < glossaryIdx);
  assert.ok(glossaryIdx < claudeIdx);

  // Hash is 64-char hex
  assert.strictEqual(result.hash.length, 64);
  assert.ok(/^[a-f0-9]{64}$/.test(result.hash));

  // All files found
  for (const key of ['SOUL', 'IDENTITY', 'NORTHSTAR', 'GLOSSARY', 'CLAUDE']) {
    assert.strictEqual(result.files[key], 'found');
  }

  restore();
  cleanup(tmp);
});

// ── T2: assemblePrompt with SOUL.md missing ─────────────────────────

test('T2: assemblePrompt with SOUL.md missing returns partial prompt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t2-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test', { SOUL: null });
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', {}, log);

  assert.strictEqual(result.files.SOUL, 'missing');
  assert.strictEqual(result.files.IDENTITY, 'found');
  assert.ok(!result.prompt.includes('Shared Personality'));
  assert.ok(result.prompt.includes('Companion Identity'));

  restore();
  cleanup(tmp);
});

// ── T3: assemblePrompt with all files missing → degraded fallback ───

test('T3: assemblePrompt with all files missing returns degraded fallback', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t3-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', {}, log);

  assert.ok(result.prompt.includes('DEGRADED MODE'));
  assert.ok(result.prompt.includes('Respond with JSON'));
  for (const key of ['SOUL', 'IDENTITY', 'NORTHSTAR', 'GLOSSARY', 'CLAUDE']) {
    assert.strictEqual(result.files[key], 'missing');
  }

  restore();
  cleanup(tmp);
});

// ── T4: Same files → same hash ──────────────────────────────────────

test('T4: same files produce identical hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t4-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const r1 = brainClient.assemblePrompt('test', {}, log);
  const r2 = brainClient.assemblePrompt('test', {}, log);

  assert.strictEqual(r1.hash, r2.hash);

  restore();
  cleanup(tmp);
});

// ── T5: File change → hash change ───────────────────────────────────

test('T5: file change produces different hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t5-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const r1 = brainClient.assemblePrompt('test', {}, log);

  fs.writeFileSync(path.join(identityDir, 'SOUL.md'), '# SOUL\nUpdated personality.');
  const r2 = brainClient.assemblePrompt('test', {}, log);

  assert.notStrictEqual(r1.hash, r2.hash);

  restore();
  cleanup(tmp);
});

// ── T6: Language "pl" ───────────────────────────────────────────────

test('T6: language pl appends Polish instruction', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t6-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', { language: 'pl' }, log);

  assert.ok(result.prompt.endsWith(
    'Language: Communicate in Polish (pl). Code and logs always in English.'
  ));

  restore();
  cleanup(tmp);
});

// ── T7: Language "en" ───────────────────────────────────────────────

test('T7: language en appends English instruction', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t7-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', { language: 'en' }, log);

  assert.ok(result.prompt.endsWith(
    'Language: Communicate in English (en). Code and logs always in English.'
  ));

  restore();
  cleanup(tmp);
});

// ── T8: No language in config → no language line ────────────────────

test('T8: no language in config appends nothing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-t8-'));
  const { identityDir, vaultDir } = createIdentityDir(tmp);
  writeIdentityFiles(identityDir, vaultDir, 'test');
  const restore = patchPaths(identityDir, vaultDir);

  const log = createLogger('test');
  const result = brainClient.assemblePrompt('test', {}, log);

  assert.ok(!result.prompt.includes('Language:'));

  restore();
  cleanup(tmp);
});

// ── Existing tests (adapted) ────────────────────────────────────────

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

test('getPromptInfo returns prompt metadata', () => {
  const { ctx, tmp, restore } = makeTmpCtx({ AI_GATEWAY_URL: undefined });
  const brain = brainClient.init(ctx);
  const info = brain.getPromptInfo();

  assert.ok(info.hash.startsWith('sha256:'));
  assert.strictEqual(typeof info.prompt, 'string');
  assert.strictEqual(typeof info.files, 'object');
  assert.ok(info.assembledAt);
  restore();
  cleanup(tmp);
});

test('judge returns error on gateway failure', async () => {
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

// ── Runner ──────────────────────────────────────────────────────────

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
  console.log(`\nAIOO Brain Client: ${pass}/${tests.length} passed`);
  return fail;
}

module.exports = { run };
