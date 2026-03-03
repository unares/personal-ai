'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { categoryToDir } = require('./classifier');
const { invalidateCache } = require('./conflict');
const { calcMeaningDensity, detectHypePatterns } = require('./intelligence');

const TRUST_BASE = {
  personal_story: 0.7,
  shared_story: 0.7,
  specification: 0.8
};

function sourceHash(content) {
  return crypto.createHash('sha256')
    .update(content).digest('hex').substring(0, 16);
}

function trustScore(category, conflicts, corrections) {
  const base = TRUST_BASE[category] || 0.5;
  const penalty = (conflicts.length * 0.1) + (corrections.length * 0.05);
  return Math.max(0.3, +(base - penalty).toFixed(2));
}

function generateFrontmatter(opts) {
  const { filePath, content, entity, classification,
          predictions, corrections, conflicts } = opts;
  const cat = classification.primary;
  const hash = sourceHash(content);
  const trust = trustScore(cat, conflicts, corrections);
  const density = calcMeaningDensity(content);
  const hype = detectHypePatterns(content);
  const conflictYaml = conflicts.map(
    c => `"${c.type}: ${c.existing_claim}"`
  ).join(', ');
  const predYaml = predictions.map(
    p => `"${p.type}: ${p.text}"`
  ).join(', ');
  const corrYaml = corrections.map(c => `"self-healed: ${c}"`).join(', ');
  const cats = classification.all_detected.map(
    c => `"${categoryToDir(c)}"`
  ).join(', ');

  const yaml = `---
category: ${categoryToDir(cat)}
entity: ${entity}
trust_score: ${trust}
source_hash: ${hash}
meaning_density: ${density}
hype_score: ${hype.score}
conflicts: [${conflictYaml}]
predictions: [${predYaml}]
corrections: [${corrYaml}]
all_categories_detected: [${cats}]
processed_date: ${new Date().toISOString()}
source_file: ${filePath}
status: stub
---`;

  return {
    yaml, trustScore: trust, sourceHash: hash,
    meaningDensity: density, hypeScore: hype.score
  };
}

function writeDistilled(frontmatter, body, cat, entity, fileName, vaultPath) {
  const fm = typeof frontmatter === 'string' ? frontmatter : frontmatter.yaml;
  const dirName = categoryToDir(cat);
  const outDir = path.join(vaultPath, entity, 'Distilled', dirName);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  const heading = `# ${path.basename(fileName, '.md')}`;
  const content = `${fm}\n\n${heading}\n\n[STUB \u2014 full distill pending via POST /distill]\n\n${body.substring(0, 1500)}`;
  fs.writeFileSync(outPath, content);
  invalidateCache(entity, dirName);
  return path.relative(vaultPath, outPath);
}

module.exports = { generateFrontmatter, writeDistilled, sourceHash };
