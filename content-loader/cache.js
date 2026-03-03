'use strict';

const { getDb } = require('./db');

const MAX_ENTRIES = 100;
const cache = new Map();

function makeKey(params) {
  const { entity, query, categories, caller, job } = params;
  return `${entity || ''}|${query || ''}|${(categories || []).join(',')}|${caller || ''}|${job || ''}`;
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function set(key, value, ttlMs = 60000) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(entity) {
  for (const [key] of cache) {
    if (key.startsWith(`${entity}|`)) cache.delete(key);
  }
}

function compactIndex() {
  try {
    getDb().exec('PRAGMA optimize');
  } catch (err) {
    console.error(`[cache] compactIndex error: ${err.message}`);
  }
}

function startCompactionSchedule() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const timer = setInterval(compactIndex, SIX_HOURS);
  timer.unref();
  return timer;
}

function clearAll() {
  cache.clear();
}

module.exports = {
  makeKey, get, set, invalidate,
  compactIndex, startCompactionSchedule, clearAll
};
