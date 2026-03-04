'use strict';

const express = require('express');
const { searchFts, searchByCategory } = require('./db-search');
const { logUsage } = require('./db');
const { rateLimit } = require('./rate-limit');
const {
  handleQuery, handleConflicts, handleConflictResolve,
  handlePredictions, handlePredictionResolve, handleUsageStats,
  handleCalibration, handleExtraCategories
} = require('./query');
const { parseJobDeclaration, filterByJob } = require('./jtbd');
const cache = require('./cache');
const { handleDistill, handleDistillStatus } = require('./distill');
const { handleGraphSnapshot } = require('./graph');
const { createIngestHandler } = require('./ingest');
const { recordSliceUsage, getEffectiveDepth, handleAccessStatus } = require('./access');
const { handleStoryCandidates } = require('./story-blog');
const { handleCredibilityCheck } = require('./credibility');
const { getPendingNotifications, clearNotifications } = require('./post-process');

// TODO [future/low-priority]: Move SCOPE_MATRIX to config.json for extensibility.
// Current agent types (clark, aioo, app-builder) are stable.
// When adding new agent types, update this mapping or load from config.
const SCOPE_MATRIX = {
  clark: ['personal-story', 'shared-story'],
  aioo: ['specification', 'shared-story'],
  'app-builder': ['specification']
};

function callerRole(callerStr) {
  if (!callerStr) return 'app-builder';
  const prefix = callerStr.split('-')[0].toLowerCase();
  return SCOPE_MATRIX[prefix] ? prefix : 'app-builder';
}

function callerEntity(callerStr) {
  if (!callerStr) return null;
  const parts = callerStr.split('-');
  return parts.length > 1 ? parts.slice(1).join('-') : null;
}

function usageMiddleware(req, res, next) {
  const start = Date.now();
  const origJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - start;
    const caller = req.headers['x-cl-caller'] || req.query.for || '';
    const entity = req.query.entity || '';
    const resultCount = body?.results?.length || body?.count || 0;
    const tokensEst = body?.tokens_estimate || 0;
    try {
      logUsage({
        endpoint: req.path, caller, entity,
        queryParams: JSON.stringify(req.query),
        tokensEstimate: tokensEst, resultCount, responseMs: ms
      });
    } catch (_) { /* don't fail request on logging error */ }
    return origJson(body);
  };
  next();
}

const DIRECTION_CHANGE_PATTERNS = [
  /\b(pivot|direction change|rebrand|new strategy|rethink)\b/i,
  /\b(we decided to stop|we're moving away|shutting down|sunsetting)\b/i,
  /\b(complete redesign|starting over|from scratch)\b/i
];

function detectHitlFlags(results) {
  const flags = [];
  for (const r of results) {
    const text = r.body_preview || '';
    for (const pattern of DIRECTION_CHANGE_PATTERNS) {
      if (pattern.test(text)) {
        flags.push({
          file: r.distilled_path,
          flag: 'direction_change_detected',
          action: 'micro_hitl_review',
          snippet: text.substring(0, 200)
        });
        break;
      }
    }
  }
  return flags;
}

function createApi(config, vaultPath) {
  const app = express();
  app.use(express.json());
  app.use(rateLimit({ maxRequests: 20, windowMs: 60000 }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '0.2.0',
      entities: config.entities.map(e => e.name)
    });
  });

  app.use(usageMiddleware);

  app.get('/slice', (req, res) => {
    const { for: forParam, entity, query, max_tokens, job } = req.query;
    const caller = req.headers['x-cl-caller'] || forParam;

    if (!entity) return res.status(400).json({ error: 'entity is required' });

    const entityConfig = config.entities.find(e => e.name === entity);
    if (!entityConfig) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const role = callerRole(caller);
    const cEntity = callerEntity(caller);

    if (role !== 'clark' && cEntity && cEntity !== entity) {
      return res.status(403).json({
        error: 'Cross-entity access denied',
        caller, requested_entity: entity
      });
    }

    const categories = SCOPE_MATRIX[role] || ['specification'];
    const cacheKey = cache.makeKey({ entity, query, categories, caller, job });
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const limit = parseInt(max_tokens) || 800;
    const depth = getEffectiveDepth(caller, entity);

    let rawResults;
    if (query) {
      const ftsResult = searchFts({ query, entity, category: null, limit: 10 });
      rawResults = ftsResult.results.filter(r => categories.includes(r.category));
    } else {
      rawResults = searchByCategory(entity, categories, 10);
    }

    const jobDecl = parseJobDeclaration(job);
    if (jobDecl) rawResults = filterByJob(rawResults, jobDecl);

    const results = rawResults.slice(0, depth).map(r => {
      const entry = {
        file: r.distilled_path, category: r.category,
        content: (r.body_preview || '').substring(0, limit)
      };
      if (r.job_relevance !== undefined) entry.job_relevance = r.job_relevance;
      return entry;
    });

    const hitlFlags = detectHitlFlags(rawResults);
    const tokensEst = results.reduce(
      (sum, r) => sum + Math.ceil(r.content.length / 4), 0
    );

    recordSliceUsage(caller, entity, results.length);

    const pending = getPendingNotifications(entity);
    const response = {
      results,
      tokens_estimate: tokensEst,
      scope: { caller: role, entity, categories, depth }
    };
    if (hitlFlags.length > 0) response.hitl_flags = hitlFlags;
    if (jobDecl) response.job = jobDecl;
    if (pending.length > 0) {
      response.pending_notifications = pending;
      clearNotifications(entity);
    }

    cache.set(cacheKey, response);
    res.json(response);
  });

  app.get('/query', handleQuery);
  app.get('/conflicts', handleConflicts);
  app.post('/conflicts/:id/resolve', handleConflictResolve);
  app.get('/predictions', handlePredictions);
  app.post('/predictions/:id/resolve', handlePredictionResolve);
  app.get('/usage', handleUsageStats);
  app.get('/calibration', handleCalibration);
  app.get('/categories/detected', handleExtraCategories);

  // Phase 4 routes
  app.post('/distill', handleDistill(config, vaultPath));
  app.get('/distill/status', handleDistillStatus);
  app.get('/graph-snapshot', handleGraphSnapshot);
  app.post('/ingest', createIngestHandler(config, vaultPath));
  app.get('/story/candidates', handleStoryCandidates);
  app.get('/access/status', handleAccessStatus);
  app.get('/credibility', handleCredibilityCheck);

  return app;
}

module.exports = { createApi };
