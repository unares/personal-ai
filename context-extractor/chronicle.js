'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateJobId(agent, entity) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').substring(0, 15);
  const hash = crypto.randomBytes(2).toString('hex');
  return `${agent}-${entity}-${ts}-${hash}`;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROTATED = 3;

function rotateIfNeeded(logPath) {
  try {
    const stat = fs.statSync(logPath);
    if (stat.size < MAX_LOG_SIZE) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = logPath.replace('.jsonl', `-${ts}.jsonl`);
    fs.renameSync(logPath, rotated);
    const dir = path.dirname(logPath);
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('chronicle-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();
    for (const old of files.slice(MAX_ROTATED)) {
      fs.unlinkSync(path.join(dir, old));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Chronicle rotation error:', e.message);
  }
}

function emitEvent(vaultPath, entity, event) {
  const logDir = path.join(vaultPath, entity, 'Logs');
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, 'chronicle.jsonl');
  rotateIfNeeded(logPath);

  const record = {
    timestamp: new Date().toISOString(),
    ...event
  };

  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(logPath, line);
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

// NanoClaw event types (v0.4)
function sessionStart(vaultPath, entity, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'SESSION_START',
    entity,
    agent: opts.agent || 'unknown',
    metadata: { container: opts.container || null, channel: opts.channel || null }
  });
}

function sessionEnd(vaultPath, entity, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'SESSION_END',
    entity,
    agent: opts.agent || 'unknown',
    metadata: { duration_ms: opts.duration_ms || null, reason: opts.reason || 'normal' }
  });
}

function taskSpawned(vaultPath, entity, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'TASK_SPAWNED',
    entity,
    agent: opts.agent || 'aioo',
    metadata: { container: opts.container, brief: opts.brief || null, app: opts.app || null }
  });
}

function skillInvoked(vaultPath, entity, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'SKILL_INVOKED',
    entity,
    agent: opts.agent || 'unknown',
    metadata: { skill: opts.skill, args: opts.args || null }
  });
}

function routingDecision(vaultPath, entity, opts) {
  emitEvent(vaultPath, entity, {
    event_type: 'ROUTING_DECISION',
    entity,
    agent: opts.agent || 'aioo',
    metadata: {
      classification: opts.classification,
      chosen_model: opts.chosen_model,
      confidence: opts.confidence || null,
      estimated_cost_savings: opts.estimated_cost_savings || null
    }
  });
}

module.exports = {
  generateJobId,
  emitEvent,
  fileCreated,
  fileModified,
  fileDeleted,
  sessionStart,
  sessionEnd,
  taskSpawned,
  skillInvoked,
  routingDecision
};
