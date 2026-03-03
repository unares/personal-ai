'use strict';

const fs = require('fs');
const path = require('path');

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function loadNorthstar(entity, vaultPath) {
  const key = entity;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.claims;

  const nsPath = path.join(vaultPath, entity, 'NORTHSTAR.md');
  if (!fs.existsSync(nsPath)) {
    const rootPath = path.join(vaultPath, 'NORTHSTAR.md');
    if (!fs.existsSync(rootPath)) return [];
    const claims = extractClaims(fs.readFileSync(rootPath, 'utf8'));
    cache.set(key, { claims, ts: Date.now() });
    return claims;
  }
  const claims = extractClaims(fs.readFileSync(nsPath, 'utf8'));
  cache.set(key, { claims, ts: Date.now() });
  return claims;
}

function extractClaims(text) {
  const claims = [];
  const lines = text.split('\n');
  const assertionPattern = /\b(must|shall|always|never|require|prohibit|ensure|avoid)\b/i;
  const goalPattern = /\b(goal|objective|mission|vision|purpose|north\s*star)\b/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (trimmed.startsWith('#')) {
        const heading = trimmed.replace(/^#+\s*/, '');
        if (heading.length > 3) claims.push({ type: 'heading', text: heading });
      }
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bullet = trimmed.substring(2).trim();
      if (bullet.length > 5) {
        const type = assertionPattern.test(bullet) ? 'assertion' : 'bullet';
        claims.push({ type, text: bullet });
      }
      continue;
    }
    if (assertionPattern.test(trimmed)) {
      claims.push({ type: 'assertion', text: trimmed });
    } else if (goalPattern.test(trimmed)) {
      claims.push({ type: 'goal', text: trimmed });
    }
  }
  return claims;
}

const OPPOSITION_PAIRS = [
  ['always', 'never'], ['must', 'skip'], ['must', 'optional'],
  ['require', 'avoid'], ['ensure', 'prevent'],
  ['enable', 'disable'], ['include', 'exclude'],
  ['autonomous', 'manual'], ['automate', 'manual']
];

function normalizeWords(text) {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function compareAgainstNorthstar(content, entity, vaultPath) {
  const claims = loadNorthstar(entity, vaultPath);
  if (claims.length === 0) return [];

  const contentWords = normalizeWords(content);
  const contentLower = content.toLowerCase();
  const contradictions = [];

  for (const claim of claims) {
    const claimWords = normalizeWords(claim.text);
    const shared = claimWords.filter(w => contentWords.includes(w));
    if (shared.length < 2) continue;

    for (const [a, b] of OPPOSITION_PAIRS) {
      const claimHasA = claim.text.toLowerCase().includes(a);
      const claimHasB = claim.text.toLowerCase().includes(b);
      const contentHasA = contentLower.includes(a);
      const contentHasB = contentLower.includes(b);

      if ((claimHasA && contentHasB) || (claimHasB && contentHasA)) {
        contradictions.push({
          type: 'northstar_contradiction',
          existing_claim: claim.text,
          new_claim: `Content opposes NORTHSTAR (${a}↔${b})`,
          recommendation: 'REVIEW — potential NORTHSTAR contradiction',
          confidence: 0.6
        });
        break;
      }
    }
  }
  return contradictions;
}

module.exports = { loadNorthstar, extractClaims, compareAgainstNorthstar };
