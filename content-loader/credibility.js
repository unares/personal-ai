'use strict';

function scoreCredibility(claim) {
  const hasKey = !!process.env.EXA_API_KEY;
  if (!hasKey) {
    return {
      score: null,
      source: 'unscored',
      reason: 'EXA_API_KEY not configured',
      claim: (claim || '').substring(0, 200)
    };
  }
  // Future: call Exa.ai + Grok for credibility scoring
  return {
    score: null,
    source: 'pending',
    reason: 'Credibility pipeline not yet implemented',
    claim: (claim || '').substring(0, 200)
  };
}

function handleCredibilityCheck(req, res) {
  const { entity, file, claim } = req.query;
  if (!entity) {
    return res.status(400).json({ error: 'entity is required' });
  }
  const result = scoreCredibility(claim || file || '');
  res.json({
    entity,
    file: file || null,
    credibility: result
  });
}

module.exports = { scoreCredibility, handleCredibilityCheck };
