'use strict';

const { getDb } = require('./db');

function initAccessSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS access_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller TEXT NOT NULL, entity TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      utilization_rate REAL DEFAULT 0,
      evidence_count INTEGER DEFAULT 0,
      last_escalated TEXT,
      UNIQUE(caller, entity)
    )
  `);
}

function recordSliceUsage(caller, entity, resultCount) {
  if (!caller || !entity) return;
  const d = getDb();
  const existing = d.prepare(
    'SELECT * FROM access_levels WHERE caller = ? AND entity = ?'
  ).get(caller, entity);

  if (!existing) {
    d.prepare(`
      INSERT INTO access_levels (caller, entity, level, evidence_count)
      VALUES (?, ?, 1, 1)
    `).run(caller, entity);
    return;
  }
  d.prepare(`
    UPDATE access_levels SET evidence_count = evidence_count + 1
    WHERE caller = ? AND entity = ?
  `).run(caller, entity);
}

function calcUtilizationRate(caller, entity) {
  const d = getDb();
  const total = d.prepare(`
    SELECT COUNT(*) as cnt FROM usage_log
    WHERE caller = ? AND entity = ? AND endpoint = '/slice'
      AND requested_at >= datetime('now', '-7 days')
  `).get(caller, entity);
  const withResults = d.prepare(`
    SELECT COUNT(*) as cnt FROM usage_log
    WHERE caller = ? AND entity = ? AND endpoint = '/slice'
      AND result_count > 0
      AND requested_at >= datetime('now', '-7 days')
  `).get(caller, entity);
  if (!total || total.cnt === 0) return 0;
  return +(withResults.cnt / total.cnt).toFixed(3);
}

function getEffectiveDepth(caller, entity) {
  if (!caller || !entity) return 5;
  const d = getDb();
  const row = d.prepare(
    'SELECT * FROM access_levels WHERE caller = ? AND entity = ?'
  ).get(caller, entity);

  if (!row) return 5;
  const rate = calcUtilizationRate(caller, entity);
  let escalation = 0;
  if (row.evidence_count >= 10) escalation = 1;
  if (row.evidence_count >= 25 && rate >= 0.5) escalation = 2;
  if (row.evidence_count >= 50 && rate >= 0.7) escalation = 3;

  if (escalation > (row.level - 1)) {
    const newLevel = escalation + 1;
    d.prepare(`
      UPDATE access_levels
      SET level = ?, utilization_rate = ?, last_escalated = datetime('now')
      WHERE caller = ? AND entity = ?
    `).run(newLevel, rate, caller, entity);
  }
  return 5 + escalation;
}

function handleAccessStatus(req, res) {
  const { caller, entity } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });
  const c = caller || req.headers['x-cl-caller'] || '';
  if (!c) return res.status(400).json({ error: 'caller is required' });
  const depth = getEffectiveDepth(c, entity);
  const rate = calcUtilizationRate(c, entity);
  const row = getDb().prepare(
    'SELECT * FROM access_levels WHERE caller = ? AND entity = ?'
  ).get(c, entity);
  res.json({
    caller: c, entity, depth,
    level: row ? row.level : 1,
    utilization_rate: rate,
    evidence_count: row ? row.evidence_count : 0
  });
}

module.exports = {
  initAccessSchema, recordSliceUsage, calcUtilizationRate,
  getEffectiveDepth, handleAccessStatus
};
