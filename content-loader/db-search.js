'use strict';

const fs = require('fs');
const path = require('path');
const { getDb, indexFile } = require('./db');

function searchFts(opts) {
  const { query, entity, category, minTrust, after, limit = 10,
          offset = 0 } = opts;
  const d = getDb();
  const params = [];
  let where = '1=1';

  if (entity) { where += ' AND p.entity = ?'; params.push(entity); }
  if (category) { where += ' AND p.category = ?'; params.push(category); }
  if (minTrust) { where += ' AND p.trust_score >= ?'; params.push(minTrust); }
  if (after) { where += ' AND p.processed_at >= ?'; params.push(after); }

  if (query) {
    const ftsQuery = query.replace(/[^\w\s]/g, '').trim();
    if (!ftsQuery) return { results: [], total: 0 };
    const sql = `
      SELECT p.*, f.rank
      FROM distilled_fts f
      JOIN processed_files p ON p.id = f.rowid
      WHERE f.distilled_fts MATCH ? AND ${where}
      ORDER BY f.rank
      LIMIT ? OFFSET ?
    `;
    params.unshift(ftsQuery);
    params.push(limit, offset);
    const rows = d.prepare(sql).all(...params);
    return { results: rows, total: rows.length };
  }

  const sql = `
    SELECT p.* FROM processed_files p
    WHERE ${where}
    ORDER BY p.processed_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);
  const rows = d.prepare(sql).all(...params);
  return { results: rows, total: rows.length };
}

function searchByCategory(entity, categories, limit = 20) {
  const d = getDb();
  const placeholders = categories.map(() => '?').join(',');
  const sql = `
    SELECT * FROM processed_files
    WHERE entity = ? AND category IN (${placeholders})
    ORDER BY processed_at DESC LIMIT ?
  `;
  return d.prepare(sql).all(entity, ...categories, limit);
}

function getEntriesByEntity(entity, limit = 100) {
  return getDb().prepare(`
    SELECT * FROM processed_files WHERE entity = ?
    ORDER BY processed_at DESC LIMIT ?
  `).all(entity, limit);
}

function getCategoryCounts(entity, days = 30) {
  return getDb().prepare(`
    SELECT category, COUNT(*) as count
    FROM processed_files
    WHERE entity = ? AND processed_at >= datetime('now', '-' || ? || ' days')
    GROUP BY category ORDER BY count DESC
  `).all(entity, days);
}

function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return { attrs: {}, body: content };
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return { attrs: {}, body: content };
  const attrs = {};
  for (let i = 1; i < endIdx; i++) {
    const colon = lines[i].indexOf(':');
    if (colon === -1) continue;
    attrs[lines[i].substring(0, colon).trim()] = lines[i].substring(colon + 1).trim();
  }
  return { attrs, body: lines.slice(endIdx + 1).join('\n').trim() };
}

function buildIndex(vaultPath, entities) {
  const d = getDb();
  const insertMany = d.transaction(() => {
    for (const entity of entities) {
      const distDir = path.join(vaultPath, entity, 'Distilled');
      if (!fs.existsSync(distDir)) continue;
      const cats = fs.readdirSync(distDir).filter(
        f => fs.statSync(path.join(distDir, f)).isDirectory()
      );
      for (const cat of cats) {
        const catDir = path.join(distDir, cat);
        const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const fp = path.join(catDir, file);
          const content = fs.readFileSync(fp, 'utf8');
          const { attrs, body } = parseFrontmatter(content);
          indexFile({
            entity, sourceFile: attrs.source_file || file,
            sourceHash: attrs.source_hash || '',
            category: cat,
            distilledPath: path.relative(vaultPath, fp),
            trustScore: parseFloat(attrs.trust_score) || 0.5,
            frontmatter: JSON.stringify(attrs),
            bodyPreview: body.substring(0, 1500)
          });
        }
      }
    }
  });
  insertMany();
  console.log(`[db] Index built for entities: ${entities.join(', ')}`);
}

function searchHybrid(opts) {
  const vecPath = process.env.SQLITE_VEC_PATH;
  if (!vecPath) {
    const ftsResult = searchFts(opts);
    return {
      results: ftsResult.results,
      total: ftsResult.total,
      hybrid: false,
      note: 'SQLITE_VEC_PATH not configured; fell back to FTS5'
    };
  }
  // Future: load sqlite-vec extension, run BM25 + cosine similarity
  // For now, fall back to FTS with metadata flag
  const ftsResult = searchFts(opts);
  return {
    results: ftsResult.results,
    total: ftsResult.total,
    hybrid: false,
    note: 'Vector search extension available but not yet implemented'
  };
}

module.exports = {
  searchFts, searchByCategory, getEntriesByEntity, getCategoryCounts,
  parseFrontmatter, buildIndex, searchHybrid
};
