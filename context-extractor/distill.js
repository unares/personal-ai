'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { classify, categoryToDir } = require('./classifier');
const { selfHeal, detectPredictions, detectArchitectureViolations } = require('./self-heal');
const { generateFrontmatter } = require('./frontmatter');
const { detectConflicts } = require('./conflict');
const { calcMeaningDensity, detectHypePatterns } = require('./intelligence');

function initDistillSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS distill_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL, file_path TEXT NOT NULL,
      pipeline TEXT NOT NULL DEFAULT 'AoT',
      status TEXT NOT NULL DEFAULT 'queued',
      triggered_by TEXT,
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT, result_summary TEXT
    )
  `);
}

function contractAoT(text) {
  console.log('[distill] AoT contraction stubbed — LLM not configured');
  return text;
}

function runDistillPipeline(entity, filePath, pipeline, vaultPath) {
  const fullPath = path.join(vaultPath, entity, 'Raw', filePath);
  if (!fs.existsSync(fullPath)) {
    return { status: 'error', error: `File not found: ${filePath}` };
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.trim()) {
    return { status: 'error', error: 'Empty file' };
  }

  const { content: healed, corrections } = selfHeal(content);
  const predictions = detectPredictions(healed);
  const violations = detectArchitectureViolations(healed);
  const classification = classify(healed);
  const category = categoryToDir(classification.primary);
  const conflicts = detectConflicts(healed, category, entity, vaultPath);

  const fm = generateFrontmatter({
    filePath, content: healed, entity,
    classification, predictions, corrections, conflicts
  });

  if (pipeline === 'AoT') {
    contractAoT(healed);
  }
  // RoT pipeline also stubs without LLM

  return {
    status: 'stubbed',
    pipeline,
    category,
    trust_score: fm.trustScore,
    meaning_density: fm.meaningDensity,
    hype_score: fm.hypeScore,
    corrections: corrections.length,
    predictions: predictions.length,
    conflicts: conflicts.length,
    violations: violations.length,
    lm_note: 'LLM pipelines stubbed — no LLM SDK configured'
  };
}

function handleDistill(config, vaultPath) {
  return function(req, res) {
    const { entity, file, pipeline } = req.body || {};
    if (!entity) return res.status(400).json({ error: 'entity is required' });
    if (!file) return res.status(400).json({ error: 'file is required' });

    const entityConfig = config.entities.find(e => e.name === entity);
    if (!entityConfig) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const pipe = pipeline || 'AoT';
    const result = runDistillPipeline(entity, file, pipe, vaultPath);

    const d = getDb();
    d.prepare(`
      INSERT INTO distill_queue (entity, file_path, pipeline, status, result_summary, processed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(entity, file, pipe, result.status, JSON.stringify(result));

    res.json({ entity, file, result });
  };
}

function handleDistillStatus(req, res) {
  const { entity, limit } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const rows = getDb().prepare(`
    SELECT * FROM distill_queue
    WHERE entity = ?
    ORDER BY queued_at DESC LIMIT ?
  `).all(entity, parseInt(limit) || 50);

  res.json({ entity, queue: rows, count: rows.length });
}

module.exports = {
  initDistillSchema, contractAoT, runDistillPipeline,
  handleDistill, handleDistillStatus
};
