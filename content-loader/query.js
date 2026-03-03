'use strict';

const { searchFts } = require('./db-search');
const {
  getConflicts, resolveConflict,
  getPredictions, resolvePrediction, getUsageStats
} = require('./db');
const { generateCalibrationProfile, detectExtraCategories } = require('./intelligence');

function handleQuery(req, res) {
  const { entity, q, category, min_trust, after,
          limit = '10', offset = '0' } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const results = searchFts({
    query: q, entity, category,
    minTrust: min_trust ? parseFloat(min_trust) : undefined,
    after, limit: Math.min(parseInt(limit) || 10, 50),
    offset: parseInt(offset) || 0
  });

  const tokensEst = results.results.reduce(
    (sum, r) => sum + Math.ceil((r.body_preview || '').length / 4), 0
  );
  res.json({ ...results, tokens_estimate: tokensEst });
}

function handleConflicts(req, res) {
  const { entity, status, limit = '50', offset = '0' } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const conflicts = getConflicts(entity, {
    status, limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.json({ conflicts, count: conflicts.length });
}

function handleConflictResolve(req, res) {
  const { id } = req.params;
  const { resolution } = req.body || {};
  if (!resolution) {
    return res.status(400).json({ error: 'resolution is required' });
  }
  const result = resolveConflict(parseInt(id), resolution);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Conflict not found' });
  }
  res.json({ ok: true, id: parseInt(id), resolution });
}

function handlePredictions(req, res) {
  const { entity, status, limit = '50', offset = '0' } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const predictions = getPredictions(entity, {
    status, limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.json({ predictions, count: predictions.length });
}

function handlePredictionResolve(req, res) {
  const { id } = req.params;
  const { status, note } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }
  const valid = ['verified', 'falsified', 'expired', 'superseded'];
  if (!valid.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${valid.join(', ')}`
    });
  }
  const result = resolvePrediction(parseInt(id), status, note);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Prediction not found' });
  }
  res.json({ ok: true, id: parseInt(id), status, note: note || '' });
}

function handleUsageStats(req, res) {
  const { entity, endpoint, days = '7' } = req.query;
  const stats = getUsageStats({
    entity, endpoint, days: parseInt(days) || 7
  });
  res.json({ stats, days: parseInt(days) || 7 });
}

function handleCalibration(req, res) {
  const { entity, human } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });
  const profile = generateCalibrationProfile(entity, human);
  res.json(profile);
}

function handleExtraCategories(req, res) {
  const { entity } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });
  const detected = detectExtraCategories(entity);
  res.json({ entity, detected, count: detected.length });
}

module.exports = {
  handleQuery, handleConflicts, handleConflictResolve,
  handlePredictions, handlePredictionResolve, handleUsageStats,
  handleCalibration, handleExtraCategories
};
