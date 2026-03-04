'use strict';

const Database = require('better-sqlite3');
const path = require('path');

let db;

function initSimpleDb(vaultPath) {
  const dbPath = path.join(vaultPath, '.context-extractor-simple.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_hash TEXT,
      category TEXT,
      distilled_path TEXT,
      trust_score REAL DEFAULT 0.7,
      body_preview TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pf_entity ON processed_files(entity);
    CREATE INDEX IF NOT EXISTS idx_pf_category ON processed_files(entity, category);
  `);
}

function getSimpleDb() { return db; }

function indexFileSimple(opts) {
  const stmt = db.prepare(`
    INSERT INTO processed_files (entity, source_file, source_hash, category,
      distilled_path, trust_score, body_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(opts.entity, opts.sourceFile, opts.sourceHash, opts.category,
    opts.distilledPath, opts.trustScore || 0.7, opts.bodyPreview || '');
}

function searchSimple(opts) {
  const { query, entity, category, limit = 10 } = opts;
  const params = [];
  let where = '1=1';
  if (entity) { where += ' AND entity = ?'; params.push(entity); }
  if (category) { where += ' AND category = ?'; params.push(category); }
  if (query) { where += ' AND body_preview LIKE ?'; params.push(`%${query}%`); }
  params.push(limit);
  const rows = db.prepare(
    `SELECT * FROM processed_files WHERE ${where} ORDER BY processed_at DESC LIMIT ?`
  ).all(...params);
  return { results: rows, total: rows.length };
}

module.exports = { initSimpleDb, getSimpleDb, indexFileSimple, searchSimple };
