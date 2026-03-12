'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteJson, ensureDir } = require('./util');

const VALID_TRANSITIONS = {
  pending: ['active', 'failed'],
  active: ['completed', 'failed']
};

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function init(ctx) {
  const taskDir = ctx.config.taskDir || path.join(ctx.vaultDir, 'Tasks');
  ensureDir(taskDir);

  const activePath = path.join(taskDir, 'active.json');
  const completedPath = path.join(taskDir, 'completed.json');
  const historyPath = path.join(taskDir, 'history.json');

  let active = loadJson(activePath, []);
  let completed = loadJson(completedPath, []);
  let history = loadJson(historyPath, []);

  function save() {
    atomicWriteJson(activePath, active);
    atomicWriteJson(completedPath, completed);
    atomicWriteJson(historyPath, history);
  }

  function create(title) {
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      title,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    active.push(task);
    history.push({ taskId: task.id, from: null, to: 'pending', timestamp: now });
    save();
    ctx.log.info('task-graph', `Created task: ${task.id} "${title}"`);
    return task;
  }

  function get(id) {
    return active.find(t => t.id === id)
      || completed.find(t => t.id === id)
      || null;
  }

  function list(status) {
    if (!status) return [...active];
    return active.filter(t => t.status === status);
  }

  function isTerminal(status) {
    return status === 'completed' || status === 'failed';
  }

  function transition(id, newStatus, meta = {}) {
    const idx = active.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Task not found in active: ${id}`);

    const task = active[idx];
    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${task.status} -> ${newStatus}`);
    }

    const now = new Date().toISOString();
    const oldStatus = task.status;
    Object.assign(task, { status: newStatus, updatedAt: now });
    if (meta.result) task.result = meta.result;
    if (meta.error) task.error = meta.error;

    history.push({ taskId: id, from: oldStatus, to: newStatus, timestamp: now, meta });

    if (isTerminal(newStatus)) {
      active.splice(idx, 1);
      completed.push(task);
    }

    save();
    ctx.log.info('task-graph', `Task ${id}: ${oldStatus} -> ${newStatus}`);
    return task;
  }

  function flush() { save(); }

  // Save initial state if files didn't exist
  save();
  ctx.log.info('task-graph', `Loaded: ${active.length} active, ${completed.length} completed`);

  return { create, get, list, transition, flush };
}

module.exports = { init };
