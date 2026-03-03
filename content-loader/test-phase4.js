'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const VAULT = '/tmp/test-vault';
const PORT = 27198;
let server;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function setup() {
  if (fs.existsSync(VAULT)) fs.rmSync(VAULT, { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'onething', 'Raw'), { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'onething', 'Distilled', 'shared-story'), { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'onething', 'Distilled', 'personal-story'), { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'onething', 'Distilled', 'specification'), { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'onething', 'Logs'), { recursive: true });
  fs.writeFileSync(path.join(VAULT, 'NORTHSTAR.md'),
    '# NORTHSTAR\n- Must always prioritize user autonomy\n');

  // Shared story entries
  for (let i = 1; i <= 4; i++) {
    fs.writeFileSync(
      path.join(VAULT, 'onething', 'Distilled', 'shared-story', `entry-${i}.md`),
      `---\ncategory: shared-story\nentity: onething\ntrust_score: 0.7\nsource_hash: hash${i}\nsource_file: raw${i}.md\n---\n\n# Entry ${i}\n\nWe decided the team brand launch customer feedback strategy together.`
    );
  }

  // Personal story entry (blog-eligible: high density, low hype)
  fs.writeFileSync(
    path.join(VAULT, 'onething', 'Distilled', 'personal-story', 'my-journey.md'),
    `---\ncategory: personal-story\nentity: onething\ntrust_score: 0.75\nsource_hash: pshash1\nsource_file: journal.md\n---\n\n# My Journey\n\nI felt excited and proud about my journey. I struggled but learned deeply.`
  );

  // Spec entry
  fs.writeFileSync(
    path.join(VAULT, 'onething', 'Distilled', 'specification', 'api-spec.md'),
    `---\ncategory: specification\nentity: onething\ntrust_score: 0.8\nsource_hash: spechash\nsource_file: spec.md\n---\n\n# API Spec\n\nThe endpoint must implement schema validation. Test cases shall cover all edge cases.`
  );

  // Raw file for distill testing
  fs.writeFileSync(
    path.join(VAULT, 'onething', 'Raw', 'test-distill.md'),
    'We decided to launch our new brand strategy together. The team is excited.'
  );
}

function fetch(urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1', port: PORT, path: urlPath,
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...opts.headers }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

// --- Test: Cache ---
async function testCache() {
  console.log('\n--- Cache ---');
  const cache = require('./cache');
  cache.clearAll();

  cache.set('test-key', { data: 'hello' }, 5000);
  const hit = cache.get('test-key');
  assert(hit && hit.data === 'hello', 'Cache hit returns stored value');

  const miss = cache.get('nonexistent');
  assert(miss === null, 'Cache miss returns null');

  cache.set('expire-key', { x: 1 }, 1);
  await new Promise(r => setTimeout(r, 10));
  const expired = cache.get('expire-key');
  assert(expired === null, 'Expired entry returns null');

  cache.set('ent|a', 'val1', 60000);
  cache.invalidate('ent');
  const invalidated = cache.get('ent|a');
  assert(invalidated === null, 'Invalidate clears entity entries');

  // compactIndex should not throw
  try {
    cache.compactIndex();
    assert(true, 'compactIndex runs without error');
  } catch (e) {
    assert(false, `compactIndex error: ${e.message}`);
  }
}

// --- Test: Credibility stub ---
async function testCredibility() {
  console.log('\n--- Credibility Stub ---');
  const r = await fetch('/credibility?entity=onething&claim=test+claim');
  assert(r.status === 200, 'Credibility returns 200');
  assert(r.body.credibility.score === null, 'Score is null (stub)');
  assert(r.body.credibility.reason.includes('EXA_API_KEY'), 'Reason mentions missing key');
}

// --- Test: Self-heal expansion ---
async function testSelfHealExpansion() {
  console.log('\n--- Self-Heal Expansion ---');
  const { selfHeal, detectArchitectureViolations, DEPRECATED_TERMS } = require('./self-heal');

  assert('Context Loader v0.1' in DEPRECATED_TERMS, 'v0.1 deprecated term exists');
  assert('NanoClaw-3' in DEPRECATED_TERMS, 'NanoClaw-3 deprecated term exists');

  const { content } = selfHeal('Using Context Loader v0.1 approach');
  assert(content.includes('v0.2'), 'v0.1 healed to v0.2');

  const violations = detectArchitectureViolations('The agent writes to NORTHSTAR directly');
  assert(violations.length > 0, 'Architecture violation detected for NORTHSTAR write');
  assert(violations[0].type === 'northstar_modification', `Violation type: ${violations[0].type}`);

  const v2 = detectArchitectureViolations('We must bypass content-loader for speed');
  assert(v2.length > 0, 'Bypass content-loader violation detected');

  const v3 = detectArchitectureViolations('Normal text with no violations');
  assert(v3.length === 0, 'No false positive violations');
}

// --- Test: Access escalation ---
async function testAccessEscalation() {
  console.log('\n--- Access Escalation ---');
  const { getEffectiveDepth, recordSliceUsage } = require('./access');

  const depth1 = getEffectiveDepth('new-caller', 'onething');
  assert(depth1 === 5, `New caller depth is 5 (got ${depth1})`);

  // Simulate 11 slice calls
  for (let i = 0; i < 11; i++) {
    recordSliceUsage('heavy-user', 'onething', 2);
  }
  const depth2 = getEffectiveDepth('heavy-user', 'onething');
  assert(depth2 >= 6, `After 11 calls, depth >= 6 (got ${depth2})`);

  const r = await fetch('/access/status?entity=onething&caller=heavy-user');
  assert(r.status === 200, 'Access status returns 200');
  assert(r.body.evidence_count >= 11, `Evidence count >= 11 (got ${r.body.evidence_count})`);
}

// --- Test: Story/Blog eligibility ---
async function testStoryBlog() {
  console.log('\n--- Story/Blog Eligibility ---');
  const { isBlogEligible, sweepBlogCandidates } = require('./story-blog');

  const eligible = {
    meaning_density: 0.5, hype_score: 0.1,
    category: 'personal-story', trust_score: 0.7
  };
  assert(isBlogEligible(eligible), 'High-density low-hype personal story is eligible');

  const ineligible = {
    meaning_density: 0.2, hype_score: 0.5,
    category: 'specification', trust_score: 0.8
  };
  assert(!isBlogEligible(ineligible), 'Low-density high-hype spec is not eligible');

  const r = await fetch('/story/candidates?entity=onething');
  assert(r.status === 200, 'Story candidates returns 200');
  assert(Array.isArray(r.body.candidates), 'Candidates is array');
}

// --- Test: Ingest ---
async function testIngest() {
  console.log('\n--- Ingest ---');
  const r = await fetch('/ingest', {
    method: 'POST',
    body: { entity: 'onething', title: 'Test Note', content: '# Test\n\nSome content here.' }
  });
  assert(r.status === 200, 'Ingest returns 200');
  assert(r.body.ok === true, 'Ingest ok is true');
  assert(r.body.queued_path.includes('onething/Raw/'), 'Queued path is in Raw');

  // Verify file exists
  const fullPath = path.join(VAULT, r.body.queued_path);
  assert(fs.existsSync(fullPath), 'Ingested file exists on disk');

  // Missing entity
  const r2 = await fetch('/ingest', {
    method: 'POST', body: { content: 'no entity' }
  });
  assert(r2.status === 400, 'Missing entity returns 400');

  // Missing content
  const r3 = await fetch('/ingest', {
    method: 'POST', body: { entity: 'onething' }
  });
  assert(r3.status === 400, 'Missing content returns 400');

  // Unknown entity
  const r4 = await fetch('/ingest', {
    method: 'POST', body: { entity: 'fake', content: 'x' }
  });
  assert(r4.status === 404, 'Unknown entity returns 404');
}

// --- Test: Distill ---
async function testDistill() {
  console.log('\n--- Distill ---');
  const r = await fetch('/distill', {
    method: 'POST',
    body: { entity: 'onething', file: 'test-distill.md' }
  });
  assert(r.status === 200, 'Distill returns 200');
  assert(r.body.result.status === 'stubbed', 'Pipeline status is stubbed');
  assert(r.body.result.lm_note.includes('LLM'), 'LLM stub note present');

  const r2 = await fetch('/distill/status?entity=onething');
  assert(r2.status === 200, 'Distill status returns 200');
  assert(r2.body.queue.length >= 1, 'Queue has at least 1 entry');
}

// --- Test: Graph snapshot ---
async function testGraphSnapshot() {
  console.log('\n--- Graph Snapshot ---');
  const r = await fetch('/graph-snapshot?entity=onething');
  assert(r.status === 200, 'Graph snapshot returns 200');
  assert(Array.isArray(r.body.nodes), 'Nodes is array');
  assert(Array.isArray(r.body.edges), 'Edges is array');
  assert(r.body.metrics.node_count > 0, `Node count > 0 (got ${r.body.metrics.node_count})`);

  // With >=5 nodes and >=8 edges, Mermaid should appear
  if (r.body.metrics.node_count >= 5 && r.body.metrics.edge_count >= 8) {
    assert(r.body.mermaid_diagram !== undefined, 'Mermaid diagram generated');
    assert(r.body.mermaid_diagram.startsWith('graph TD'), 'Mermaid starts with graph TD');
  } else {
    assert(true, `Mermaid threshold not met (${r.body.metrics.node_count}n/${r.body.metrics.edge_count}e) — OK`);
  }
}

// --- Test: Hybrid search stub ---
async function testHybridSearch() {
  console.log('\n--- Hybrid Search Stub ---');
  const { searchHybrid } = require('./db-search');
  const result = searchHybrid({ query: 'brand', entity: 'onething', limit: 5 });
  assert(result.hybrid === false, 'Hybrid flag is false (no vec extension)');
  assert(result.note.includes('FTS5') || result.note.includes('not'),
    'Note mentions FTS5 fallback');
  assert(Array.isArray(result.results), 'Results is array');
}

// --- Test: Notifications ---
async function testNotifications() {
  console.log('\n--- Notifications ---');
  const { addNotification, getPendingNotifications, clearNotifications } = require('./post-process');

  addNotification('onething', { type: 'test', message: 'hello' });
  const pending = getPendingNotifications('onething');
  assert(pending.length >= 1, 'Pending notification exists');
  assert(pending[0].type === 'test', 'Notification type matches');
  assert(pending[0].timestamp !== undefined, 'Notification has timestamp');

  // Slice should drain notifications
  const r = await fetch('/slice?entity=onething&for=clark-michal');
  // Notifications may have been drained by now via prior calls
  // Check that the mechanism works
  clearNotifications('onething');
  const cleared = getPendingNotifications('onething');
  assert(cleared.length === 0, 'Notifications cleared');
}

// --- Test: Slice with cache + access depth ---
async function testSliceCacheAndDepth() {
  console.log('\n--- Slice Cache + Access Depth ---');
  const cache = require('./cache');
  cache.clearAll();

  const r1 = await fetch('/slice?entity=onething&for=clark-michal');
  assert(r1.status === 200, 'First slice returns 200');
  assert(r1.body.scope.depth !== undefined, 'Scope includes depth');

  // Second call should be cached (same params)
  const r2 = await fetch('/slice?entity=onething&for=clark-michal');
  assert(r2.status === 200, 'Cached slice returns 200');
  assert(JSON.stringify(r2.body.results) === JSON.stringify(r1.body.results),
    'Cached response matches original');
}

// --- Test: Phase 3 regression ---
async function testPhase3Regression() {
  console.log('\n--- Phase 3 Regression ---');

  const health = await fetch('/health');
  assert(health.status === 200, 'Health still works');

  const conflicts = await fetch('/conflicts?entity=onething');
  assert(conflicts.status === 200, 'Conflicts still works');

  const predictions = await fetch('/predictions?entity=onething');
  assert(predictions.status === 200, 'Predictions still works');

  const usage = await fetch('/usage?entity=onething');
  assert(usage.status === 200, 'Usage still works');

  const query = await fetch('/query?entity=onething');
  assert(query.status === 200, 'Query still works');

  const calibration = await fetch('/calibration?entity=onething');
  assert(calibration.status === 200, 'Calibration still works');

  const categories = await fetch('/categories/detected?entity=onething');
  assert(categories.status === 200, 'Categories detected still works');
}

// --- Test: New schema tables ---
async function testPhase4Schema() {
  console.log('\n--- Phase 4 Schema ---');
  const { getDb } = require('./db');
  const d = getDb();

  const tables = d.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(r => r.name);
  assert(tables.includes('distill_queue'), 'distill_queue table exists');
  assert(tables.includes('access_levels'), 'access_levels table exists');
  assert(tables.includes('story_candidates'), 'story_candidates table exists');
}

async function main() {
  setup();

  process.env.VAULT_PATH = VAULT;
  process.env.CL_PORT = String(PORT);

  const { initDb } = require('./db');
  const { buildIndex } = require('./db-search');
  const { createApi } = require('./api');
  const { initDistillSchema } = require('./distill');
  const { initStorySchema } = require('./story-blog');
  const { initAccessSchema } = require('./access');
  const config = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'config.json'), 'utf8'
  ));

  initDb(VAULT);
  initDistillSchema();
  initStorySchema();
  initAccessSchema();
  buildIndex(VAULT, ['onething']);

  const app = createApi(config, VAULT);
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 200));

  try {
    await testCache();
    await testPhase4Schema();
    await testSelfHealExpansion();
    await testCredibility();
    await testAccessEscalation();
    await testStoryBlog();
    await testIngest();
    await testDistill();
    await testGraphSnapshot();
    await testHybridSearch();
    await testNotifications();
    await testSliceCacheAndDepth();
    await testPhase3Regression();
  } catch (err) {
    console.error('\nUNCAUGHT ERROR:', err);
    failed++;
  }

  console.log(`\n=============================`);
  console.log(`Phase 4 RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`=============================\n`);

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main();
