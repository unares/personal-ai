'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS processed_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, source_file TEXT NOT NULL,
  source_hash TEXT NOT NULL, category TEXT NOT NULL,
  distilled_path TEXT NOT NULL, trust_score REAL NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  frontmatter TEXT, body_preview TEXT,
  meaning_density REAL DEFAULT 0, hype_score REAL DEFAULT 0,
  UNIQUE(entity, distilled_path)
);

CREATE VIRTUAL TABLE IF NOT EXISTS distilled_fts USING fts5(
  entity, category, title, body,
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS processed_files_ai AFTER INSERT ON processed_files BEGIN
  INSERT INTO distilled_fts(rowid, entity, category, title, body)
  VALUES (new.id, new.entity, new.category,
    COALESCE(new.source_file, ''), COALESCE(new.body_preview, ''));
END;

CREATE TRIGGER IF NOT EXISTS processed_files_ad AFTER DELETE ON processed_files BEGIN
  DELETE FROM distilled_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS processed_files_au AFTER UPDATE ON processed_files BEGIN
  DELETE FROM distilled_fts WHERE rowid = old.id;
  INSERT INTO distilled_fts(rowid, entity, category, title, body)
  VALUES (new.id, new.entity, new.category,
    COALESCE(new.source_file, ''), COALESCE(new.body_preview, ''));
END;

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, source_file TEXT NOT NULL,
  conflict_type TEXT NOT NULL, existing_claim TEXT,
  new_claim TEXT, existing_file TEXT,
  recommendation TEXT, confidence REAL,
  resolution TEXT DEFAULT 'open',
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, source_file TEXT NOT NULL,
  prediction_type TEXT NOT NULL, prediction_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT, resolution_note TEXT,
  resolution_target TEXT, actual_value TEXT, predicted_value TEXT
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL, caller TEXT, entity TEXT,
  query_params TEXT, tokens_estimate INTEGER DEFAULT 0,
  result_count INTEGER DEFAULT 0, response_ms INTEGER DEFAULT 0,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calibration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, human TEXT NOT NULL,
  prediction_type TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  total_delta REAL DEFAULT 0,
  avg_delta REAL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity, human, prediction_type)
);
`;

const MIGRATIONS = [
  `ALTER TABLE processed_files ADD COLUMN meaning_density REAL DEFAULT 0`,
  `ALTER TABLE processed_files ADD COLUMN hype_score REAL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN resolution_target TEXT`,
  `ALTER TABLE predictions ADD COLUMN actual_value TEXT`,
  `ALTER TABLE predictions ADD COLUMN predicted_value TEXT`
];

function runMigrations(d) {
  for (const sql of MIGRATIONS) {
    try { d.exec(sql); } catch (_) { /* column already exists */ }
  }
}

function initDb(vaultPath) {
  const dbPath = path.join(vaultPath, 'metadata.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized — call initDb first');
  return db;
}

function indexFile(opts) {
  const { entity, sourceFile, sourceHash, category,
          distilledPath, trustScore, frontmatter, bodyPreview,
          meaningDensity, hypeScore } = opts;
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO processed_files
      (entity, source_file, source_hash, category,
       distilled_path, trust_score, frontmatter, body_preview,
       meaning_density, hype_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(entity, sourceFile, sourceHash, category,
    distilledPath, trustScore, frontmatter || '', bodyPreview || '',
    meaningDensity || 0, hypeScore || 0);
}

function updateTrustScore(id, newScore) {
  return getDb().prepare(
    `UPDATE processed_files SET trust_score = ? WHERE id = ?`
  ).run(newScore, id);
}

function getAllProcessedFiles(entity) {
  return getDb().prepare(
    `SELECT * FROM processed_files WHERE entity = ?`
  ).all(entity);
}

function getExpiredPredictions(entity) {
  return getDb().prepare(`
    SELECT * FROM predictions
    WHERE entity = ? AND status = 'open'
      AND resolution_target IS NOT NULL
      AND resolution_target <= datetime('now')
    ORDER BY detected_at ASC
  `).all(entity);
}

function logCalibration(opts) {
  const { entity, human, predictionType, delta } = opts;
  const d = getDb();
  const existing = d.prepare(`
    SELECT * FROM calibration
    WHERE entity = ? AND human = ? AND prediction_type = ?
  `).get(entity, human, predictionType);

  if (existing) {
    const newCount = existing.count + 1;
    const newTotal = existing.total_delta + Math.abs(delta);
    const newAvg = +(newTotal / newCount).toFixed(4);
    return d.prepare(`
      UPDATE calibration
      SET count = ?, total_delta = ?, avg_delta = ?,
          last_updated = datetime('now')
      WHERE id = ?
    `).run(newCount, newTotal, newAvg, existing.id);
  }
  return d.prepare(`
    INSERT INTO calibration (entity, human, prediction_type,
      count, total_delta, avg_delta)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(entity, human, predictionType, Math.abs(delta), Math.abs(delta));
}

function getCalibrationProfile(entity, human) {
  const where = human
    ? 'entity = ? AND human = ?'
    : 'entity = ?';
  const params = human ? [entity, human] : [entity];
  return getDb().prepare(`
    SELECT * FROM calibration WHERE ${where}
    ORDER BY prediction_type
  `).all(...params);
}

function purgeOldUsage(days = 30) {
  return getDb().prepare(`
    DELETE FROM usage_log
    WHERE requested_at < datetime('now', '-' || ? || ' days')
  `).run(days);
}

function getRecentUsageForEntry(distilledPath, days = 30) {
  return getDb().prepare(`
    SELECT COUNT(*) as count FROM usage_log
    WHERE query_params LIKE ? AND
      requested_at >= datetime('now', '-' || ? || ' days')
  `).get(`%${distilledPath}%`, days);
}

function logConflict(opts) {
  const { entity, sourceFile, conflictType, existingClaim,
          newClaim, existingFile, recommendation, confidence } = opts;
  const stmt = getDb().prepare(`
    INSERT INTO conflicts
      (entity, source_file, conflict_type, existing_claim,
       new_claim, existing_file, recommendation, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(entity, sourceFile, conflictType,
    existingClaim || '', newClaim || '', existingFile || '',
    recommendation || '', confidence || 0.5);
}

function getConflicts(entity, opts = {}) {
  const { status, limit = 50, offset = 0 } = opts;
  const params = [entity];
  let where = 'entity = ?';
  if (status) { where += ' AND resolution = ?'; params.push(status); }
  params.push(limit, offset);
  return getDb().prepare(`
    SELECT * FROM conflicts WHERE ${where}
    ORDER BY detected_at DESC LIMIT ? OFFSET ?
  `).all(...params);
}

function resolveConflict(id, resolution) {
  return getDb().prepare(`
    UPDATE conflicts SET resolution = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(resolution, id);
}

function logPrediction(opts) {
  const { entity, sourceFile, predictionType, predictionText } = opts;
  return getDb().prepare(`
    INSERT INTO predictions (entity, source_file, prediction_type, prediction_text)
    VALUES (?, ?, ?, ?)
  `).run(entity, sourceFile, predictionType, predictionText);
}

function getPredictions(entity, opts = {}) {
  const { status, limit = 50, offset = 0 } = opts;
  const params = [entity];
  let where = 'entity = ?';
  if (status) { where += ' AND status = ?'; params.push(status); }
  params.push(limit, offset);
  return getDb().prepare(`
    SELECT * FROM predictions WHERE ${where}
    ORDER BY detected_at DESC LIMIT ? OFFSET ?
  `).all(...params);
}

function resolvePrediction(id, status, note) {
  return getDb().prepare(`
    UPDATE predictions SET status = ?, resolution_note = ?,
      resolved_at = datetime('now') WHERE id = ?
  `).run(status, note || '', id);
}

function logUsage(opts) {
  const { endpoint, caller, entity, queryParams,
          tokensEstimate, resultCount, responseMs } = opts;
  return getDb().prepare(`
    INSERT INTO usage_log
      (endpoint, caller, entity, query_params,
       tokens_estimate, result_count, response_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(endpoint, caller || '', entity || '',
    queryParams || '', tokensEstimate || 0,
    resultCount || 0, responseMs || 0);
}

function getUsageStats(opts = {}) {
  const { entity, endpoint, days = 7 } = opts;
  const params = [];
  let where = `requested_at >= datetime('now', '-${parseInt(days)} days')`;
  if (entity) { where += ' AND entity = ?'; params.push(entity); }
  if (endpoint) { where += ' AND endpoint = ?'; params.push(endpoint); }
  const rows = getDb().prepare(`
    SELECT endpoint, COUNT(*) as count,
      AVG(response_ms) as avg_ms, SUM(tokens_estimate) as total_tokens
    FROM usage_log WHERE ${where}
    GROUP BY endpoint ORDER BY count DESC
  `).all(...params);
  return rows;
}

module.exports = {
  initDb, getDb, indexFile,
  updateTrustScore, getAllProcessedFiles,
  logConflict, getConflicts, resolveConflict,
  logPrediction, getPredictions, resolvePrediction,
  getExpiredPredictions,
  logCalibration, getCalibrationProfile,
  logUsage, getUsageStats, purgeOldUsage, getRecentUsageForEntry
};
