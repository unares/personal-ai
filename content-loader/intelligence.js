'use strict';

const { getDb, getAllProcessedFiles, getCalibrationProfile } = require('./db');
const { getCategoryCounts } = require('./db-search');

const HYPE_PATTERNS = [
  { regex: /\b(revolutionary|game[-\s]?changer|groundbreaking|unprecedented|disruptive)\b/gi, weight: 1.0 },
  { regex: /\b(amazing|incredible|unbelievable|insane|mind[-\s]?blowing)\b/gi, weight: 0.8 },
  { regex: /\b(best ever|#1|number one|world[-\s]?class|industry[-\s]?leading)\b/gi, weight: 0.9 },
  { regex: /\b(guaranteed|proven|secret|hack|trick)\b/gi, weight: 0.7 },
  { regex: /!!!|🚀{2,}|💯|🔥{2,}/g, weight: 0.6 },
  { regex: /\b(you won't believe|this changes everything|here's why)\b/gi, weight: 0.8 }
];

const EVIDENCE_MARKERS = [
  /\b(according to|research shows|data indicates|study found|evidence suggests)\b/i,
  /\b(source:|ref:|citation|doi:|arxiv)\b/i,
  /\bhttps?:\/\/\S+/i,
  /\b\d+%\b/i
];

function calcMeaningDensity(text) {
  if (!text || text.length < 10) return 0;
  const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return 0;

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'shall', 'can',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'it', 'its', 'this', 'that', 'and', 'or', 'but', 'not', 'if',
    'as', 'so', 'than', 'then', 'also', 'just', 'very', 'more'
  ]);

  const normalized = tokens
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 2 && !stopWords.has(t));

  const unique = new Set(normalized);
  const per100 = tokens.length >= 100
    ? unique.size / (tokens.length / 100)
    : unique.size / (tokens.length / 100);

  return Math.min(1, +(per100 / 100).toFixed(3));
}

function detectHypePatterns(text) {
  if (!text) return { score: 0, flags: [] };
  const flags = [];
  let totalWeight = 0;

  for (const { regex, weight } of HYPE_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    const matches = text.match(re);
    if (matches) {
      totalWeight += weight * matches.length;
      flags.push(...matches.map(m => m.trim()));
    }
  }

  let evidenceCount = 0;
  for (const pattern of EVIDENCE_MARKERS) {
    if (pattern.test(text)) evidenceCount++;
  }

  const hypeRaw = totalWeight / Math.max(1, text.split(/\s+/).length / 100);
  const evidenceDiscount = evidenceCount * 0.15;
  const score = Math.min(1, Math.max(0, +(hypeRaw - evidenceDiscount).toFixed(3)));

  return { score, flags: [...new Set(flags)].slice(0, 10) };
}

function calcTrustWithDecay(baseTrust, processedAt) {
  if (!processedAt) return baseTrust;
  const processed = new Date(processedAt).getTime();
  const now = Date.now();
  const days = Math.max(0, (now - processed) / (1000 * 60 * 60 * 24));
  const decay = 1 / (1 + Math.log(1 + days / 90));
  return +(baseTrust * decay).toFixed(3);
}

function detectExtraCategories(entity) {
  const counts = getCategoryCounts(entity, 30);
  const known = new Set([
    'personal-story', 'shared-story', 'specification'
  ]);
  const extras = [];

  for (const row of counts) {
    if (!known.has(row.category) && row.count >= 15) {
      extras.push({
        category: row.category,
        count: row.count,
        flag: 'extra_category_detected',
        action: 'micro_hitl_required'
      });
    }
  }

  const allEntries = getAllProcessedFiles(entity);
  const tagCounts = {};
  for (const entry of allEntries) {
    try {
      const fm = JSON.parse(entry.frontmatter || '{}');
      const cats = fm.all_categories_detected;
      if (!cats) continue;
      const parsed = typeof cats === 'string'
        ? cats.replace(/[\[\]"]/g, '').split(',').map(s => s.trim())
        : cats;
      for (const c of parsed) {
        if (c && !known.has(c)) tagCounts[c] = (tagCounts[c] || 0) + 1;
      }
    } catch (_) { /* skip malformed frontmatter */ }
  }

  for (const [tag, count] of Object.entries(tagCounts)) {
    if (count >= 15 && !extras.find(e => e.category === tag)) {
      extras.push({
        category: tag, count,
        flag: 'tag_cluster_detected',
        action: 'micro_hitl_required'
      });
    }
  }
  return extras;
}

function generateCalibrationProfile(entity, human) {
  const profile = getCalibrationProfile(entity, human);
  if (profile.length === 0) {
    return { entity, human: human || 'all', types: [], overall_avg_delta: 0 };
  }
  const totalCount = profile.reduce((s, r) => s + r.count, 0);
  const weightedDelta = profile.reduce(
    (s, r) => s + r.avg_delta * r.count, 0
  );
  return {
    entity,
    human: human || 'all',
    types: profile.map(r => ({
      prediction_type: r.prediction_type,
      count: r.count,
      avg_delta: r.avg_delta,
      last_updated: r.last_updated
    })),
    overall_avg_delta: totalCount > 0
      ? +(weightedDelta / totalCount).toFixed(4) : 0
  };
}

module.exports = {
  calcMeaningDensity, detectHypePatterns, calcTrustWithDecay,
  detectExtraCategories, generateCalibrationProfile
};
