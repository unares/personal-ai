'use strict';

const { getDb, getAllProcessedFiles } = require('./db');

function initStorySchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS story_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      distilled_path TEXT NOT NULL UNIQUE,
      eligibility_score REAL NOT NULL,
      pipeline TEXT NOT NULL DEFAULT 'StoryUpdate',
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'candidate'
    )
  `);
}

function isBlogEligible(entry) {
  const density = entry.meaning_density || 0;
  const hype = entry.hype_score || 0;
  const cat = entry.category || '';
  const eligible = density > 0.4 && hype < 0.3 &&
    (cat === 'personal-story' || cat === 'shared-story');
  return eligible;
}

function calcEligibilityScore(entry) {
  const density = entry.meaning_density || 0;
  const trust = entry.trust_score || 0;
  const hype = entry.hype_score || 0;
  return +((density * 0.4 + trust * 0.4 + (1 - hype) * 0.2)).toFixed(3);
}

function sweepBlogCandidates(entity) {
  const files = getAllProcessedFiles(entity);
  const d = getDb();
  let added = 0;
  for (const f of files) {
    if (!isBlogEligible(f)) continue;
    const score = calcEligibilityScore(f);
    const pipeline = f.category === 'personal-story'
      ? 'StoryUpdate' : 'ExpertBlogger';
    try {
      d.prepare(`
        INSERT OR REPLACE INTO story_candidates
          (entity, distilled_path, eligibility_score, pipeline)
        VALUES (?, ?, ?, ?)
      `).run(entity, f.distilled_path, score, pipeline);
      added++;
    } catch (_) { /* ignore duplicates */ }
  }
  if (added > 0) {
    console.log(`[story-blog] Swept ${added} candidates for ${entity}`);
  }
  return added;
}

function handleStoryCandidates(req, res) {
  const { entity, status, limit } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const d = getDb();
  const params = [entity];
  let where = 'entity = ?';
  if (status) { where += ' AND status = ?'; params.push(status); }
  params.push(parseInt(limit) || 50);

  const rows = d.prepare(`
    SELECT * FROM story_candidates
    WHERE ${where}
    ORDER BY eligibility_score DESC LIMIT ?
  `).all(...params);

  res.json({ entity, candidates: rows, count: rows.length });
}

module.exports = {
  initStorySchema, isBlogEligible, sweepBlogCandidates,
  handleStoryCandidates
};
