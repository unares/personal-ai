'use strict';

const express = require('express');
const { searchSimple } = require('./db-simple');
const { createIngestHandler } = require('./ingest');
const { rateLimit } = require('./rate-limit');

// TODO [future/low-priority]: Move SCOPE_MATRIX to config.json for extensibility.
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

function createSimpleApi(config, vaultPath) {
  const app = express();
  app.use(express.json());
  app.use(rateLimit(60, 60000));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '0.4.0', mode: 'simple' });
  });

  app.get('/slice', (req, res) => {
    const { entity, category, query, limit } = req.query;
    const caller = req.query.for || req.headers['x-caller'];
    const role = callerRole(caller);
    const allowed = SCOPE_MATRIX[role] || [];
    if (category && !allowed.includes(category)) {
      return res.status(403).json({ error: `Role '${role}' cannot access '${category}'` });
    }
    const results = searchSimple({
      entity, category, query, limit: parseInt(limit) || 10
    });
    res.json(results);
  });

  app.get('/query', (req, res) => {
    const { entity, q, category, limit } = req.query;
    const results = searchSimple({
      entity, category, query: q, limit: parseInt(limit) || 10
    });
    res.json(results);
  });

  app.post('/ingest', createIngestHandler(config, vaultPath));

  return app;
}

module.exports = { createSimpleApi };
