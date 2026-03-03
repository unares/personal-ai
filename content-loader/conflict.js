'use strict';

const fs = require('fs');
const path = require('path');
const { compareAgainstNorthstar } = require('./northstar');

const CONFLICT_TERMS = {
  'Gemini 2.0 Pro': {
    current: 'Gemini 3.1 Pro',
    reason: 'potential outdated reference'
  }
};

const distilledCache = new Map();

function invalidateCache(entity, category) {
  distilledCache.delete(`${entity}/${category}`);
}

function scanExisting(category, entity, vaultPath) {
  const key = `${entity}/${category}`;
  if (distilledCache.has(key)) return distilledCache.get(key);

  const dir = path.join(vaultPath, entity, 'Distilled', category);
  if (!fs.existsSync(dir)) return [];

  const entries = [];
  const files = fs.readdirSync(dir, { recursive: true });
  for (const file of files) {
    const fp = path.join(dir, file.toString());
    if (!fp.endsWith('.md') || !fs.statSync(fp).isFile()) continue;
    const content = fs.readFileSync(fp, 'utf8');
    const firstLine = content.split('\n').find(
      l => l.startsWith('# ') || (l.trim() && !l.startsWith('---'))
    ) || '';
    entries.push({ file: file.toString(), heading: firstLine, content });
  }
  distilledCache.set(key, entries);
  return entries;
}

function detectConflicts(content, category, entity, vaultPath) {
  const conflicts = [];

  for (const [term, info] of Object.entries(CONFLICT_TERMS)) {
    if (content.includes(term)) {
      conflicts.push({
        type: 'deprecated_reference',
        existing_claim: `${info.current} is current`,
        new_claim: `Content references "${term}"`,
        recommendation: `REVIEW \u2014 ${info.reason}`,
        confidence: 0.7
      });
    }
  }

  const existing = scanExisting(category, entity, vaultPath);
  for (const entry of existing) {
    if (hasContradiction(content, entry.content)) {
      conflicts.push({
        type: 'contradicts_existing',
        existing_claim: entry.heading.replace(/^#+\s*/, ''),
        new_claim: 'New content may contradict existing entry',
        existing_file: entry.file,
        recommendation: 'REVIEW \u2014 potential contradiction detected',
        confidence: 0.5
      });
    }
  }

  const nsConflicts = compareAgainstNorthstar(content, entity, vaultPath);
  conflicts.push(...nsConflicts);

  return conflicts;
}

function hasContradiction(newText, existingText) {
  const negations = [
    /\bnot\s+\w+/gi, /\bno longer\b/gi, /\binstead of\b/gi,
    /\breplaced by\b/gi, /\bdeprecated\b/gi, /\bremoved\b/gi
  ];
  for (const pattern of negations) {
    const newMatch = pattern.test(newText);
    pattern.lastIndex = 0;
    if (!newMatch) continue;
    const words = existingText.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const newWords = newText.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const shared = words.filter(w => newWords.includes(w));
    if (shared.length >= 2) return true;
  }
  return false;
}

module.exports = { detectConflicts, invalidateCache };
