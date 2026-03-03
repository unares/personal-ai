'use strict';

function parseJobDeclaration(jobParam) {
  if (!jobParam) return null;
  try {
    const job = typeof jobParam === 'string' ? JSON.parse(jobParam) : jobParam;
    if (!job.outcome) return null;
    return {
      outcome: String(job.outcome),
      constraints: Array.isArray(job.constraints) ? job.constraints.map(String) : [],
      context: job.context ? String(job.context) : ''
    };
  } catch (_) {
    return null;
  }
}

function normalizeTokens(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function scoreOutcomeRelevance(entry, outcome) {
  const outcomeTokens = normalizeTokens(outcome);
  if (outcomeTokens.length === 0) return 0;

  const contentText = [
    entry.body_preview || '',
    entry.category || '',
    entry.distilled_path || ''
  ].join(' ');
  const contentTokens = new Set(normalizeTokens(contentText));

  let matches = 0;
  for (const token of outcomeTokens) {
    if (contentTokens.has(token)) matches++;
  }

  const wordOverlap = matches / outcomeTokens.length;

  const categoryMap = {
    'personal-story': ['learn', 'experience', 'insight', 'growth', 'lesson'],
    'shared-story': ['team', 'decision', 'direction', 'brand', 'launch'],
    'specification': ['build', 'implement', 'deploy', 'api', 'feature']
  };

  let categoryBonus = 0;
  const cat = entry.category || '';
  const catKeywords = categoryMap[cat] || [];
  for (const kw of catKeywords) {
    if (outcome.toLowerCase().includes(kw)) {
      categoryBonus = 0.15;
      break;
    }
  }

  return Math.min(1, +(wordOverlap + categoryBonus).toFixed(3));
}

function excludeByConstraints(results, constraints) {
  if (!constraints || constraints.length === 0) return results;
  return results.filter(entry => {
    const text = (entry.body_preview || '').toLowerCase() +
      ' ' + (entry.distilled_path || '').toLowerCase();
    for (const constraint of constraints) {
      const tokens = normalizeTokens(constraint);
      const matchCount = tokens.filter(t => text.includes(t)).length;
      if (tokens.length > 0 && matchCount / tokens.length > 0.6) return false;
    }
    return true;
  });
}

function filterByJob(results, job) {
  if (!job || !job.outcome) return results;

  let filtered = excludeByConstraints(results, job.constraints);

  const scored = filtered.map(entry => ({
    ...entry,
    job_relevance: scoreOutcomeRelevance(entry, job.outcome)
  }));

  scored.sort((a, b) => b.job_relevance - a.job_relevance);

  return scored.filter(r => r.job_relevance > 0.05);
}

module.exports = {
  parseJobDeclaration, filterByJob,
  excludeByConstraints, scoreOutcomeRelevance
};
