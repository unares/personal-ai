'use strict';

const crypto = require('node:crypto');

function createEnvelope(type, from, to, payload, replyTo = null) {
  return {
    id: crypto.randomUUID(),
    type,
    from,
    to,
    timestamp: new Date().toISOString(),
    payload: payload || {},
    replyTo
  };
}

function validateEnvelope(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.id !== 'string' || !obj.id) return false;
  if (typeof obj.type !== 'string' || !obj.type) return false;
  if (typeof obj.from !== 'string' || !obj.from) return false;
  if (typeof obj.to !== 'string' || !obj.to) return false;
  if (typeof obj.timestamp !== 'string' || !obj.timestamp) return false;
  if (!obj.payload || typeof obj.payload !== 'object') return false;
  if (!('replyTo' in obj)) return false;
  if (obj.replyTo !== null && typeof obj.replyTo !== 'string') return false;
  return true;
}

module.exports = { createEnvelope, validateEnvelope };
