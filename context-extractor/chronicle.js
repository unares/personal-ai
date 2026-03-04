'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateJobId(agent, entity) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').substring(0, 15);
  const hash = crypto.randomBytes(2).toString('hex');
  return `${agent}-${entity}-${ts}-${hash}`;
}

function emitEvent(vaultPath, entity, event) {
  const logDir = path.join(vaultPath, entity, 'Logs');
  fs.mkdirSync(logDir, { recursive: true });

  const record = {
    timestamp: new Date().toISOString(),
    ...event
  };

  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(path.join(logDir, 'chronicle.jsonl'), line);
}

function fileCreated(vaultPath, entity, filePath, opts) {
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  emitEvent(vaultPath, entity, {
    event_type: 'FILE_CREATED',
    entity,
    path: path.relative(path.join(vaultPath, entity), filePath),
    job_id: opts.jobId || null,
    agent: opts.agent || 'context-extractor',
    metadata: {
      size_bytes: stat ? stat.size : 0,
      source: opts.source || 'unknown'
    }
  });
}

function fileModified(vaultPath, entity, filePath, opts) {
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  emitEvent(vaultPath, entity, {
    event_type: 'FILE_MODIFIED',
    entity,
    path: path.relative(path.join(vaultPath, entity), filePath),
    job_id: opts.jobId || null,
    agent: opts.agent || 'context-extractor',
    metadata: {
      size_bytes: stat ? stat.size : 0,
      source: opts.source || 'unknown'
    }
  });
}

function fileDeleted(vaultPath, entity, filePath, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'FILE_DELETED',
    entity,
    path: path.relative(path.join(vaultPath, entity), filePath),
    job_id: opts.jobId || null,
    agent: opts.agent || 'context-extractor',
    metadata: { source: opts.source || 'unknown' }
  });
}

module.exports = {
  generateJobId,
  emitEvent,
  fileCreated,
  fileModified,
  fileDeleted
};
