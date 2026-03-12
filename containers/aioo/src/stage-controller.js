'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, ensureDir } = require('./util');

const STAGES = ['demo', 'testing', 'launch', 'scaling'];

function init(ctx) {
  const taskDir = ctx.config.taskDir || path.join(ctx.vaultDir, 'Tasks');
  const statePath = path.join(taskDir, 'stages.json');
  const logsDir = path.join(ctx.vaultDir, 'Logs');
  ensureDir(logsDir);

  let state = loadState();

  function loadState() {
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
      return {};
    }
  }

  function save() {
    atomicWriteJson(statePath, state);
  }

  function getStage(app) {
    return state[app] ? state[app].stage : null;
  }

  function getAllStages() {
    return { ...state };
  }

  function isValidProgression(fromStage, toStage) {
    const fromIdx = STAGES.indexOf(fromStage);
    const toIdx = STAGES.indexOf(toStage);
    return fromIdx >= 0 && toIdx === fromIdx + 1;
  }

  function requestTransition(app, fromStage, toStage) {
    if (!isValidProgression(fromStage, toStage)) {
      ctx.log.error('stage', `Invalid progression: ${fromStage} -> ${toStage}`);
      return { sent: false, reason: `Invalid: ${fromStage} -> ${toStage}` };
    }

    const current = getStage(app);
    if (current && current !== fromStage) {
      ctx.log.error('stage', `Stage mismatch: expected ${current}, got ${fromStage}`);
      return { sent: false, reason: `Current stage is ${current}, not ${fromStage}` };
    }

    if (state[app] && state[app].pending) {
      ctx.log.warn('stage', `Transition already pending for ${app}`);
      return { sent: false, reason: 'Transition already pending' };
    }

    const envelope = ctx.ipc.send('stage-signal', 'nanoclaw-paw', {
      entity: ctx.entity, app, fromStage, toStage
    });

    state[app] = {
      stage: fromStage,
      pending: { toStage, signalId: envelope.id, sentAt: new Date().toISOString() },
      updatedAt: new Date().toISOString()
    };
    save();

    ctx.log.info('stage', `Requested: ${app} ${fromStage} -> ${toStage}`);
    return { sent: true, signalId: envelope.id };
  }

  function handleStageAck(envelope) {
    const { status, app, fromStage, toStage, duration, reason } = envelope.payload;
    const now = new Date().toISOString();

    if (status === 'success') {
      state[app] = { stage: toStage, pending: null, updatedAt: now };
      ctx.log.info('stage', `Complete: ${app} ${fromStage} -> ${toStage} (${duration})`);
    } else {
      if (state[app]) {
        state[app].pending = null;
        state[app].updatedAt = now;
      }
      ctx.log.error('stage', `Failed: ${app} ${fromStage} -> ${toStage}: ${reason}`);
    }

    save();
    logTransition(app, fromStage, toStage, status, duration, reason);
    return { acknowledged: true, status };
  }

  function logTransition(app, from, to, status, duration, reason) {
    const lines = [
      `## ${new Date().toISOString()} — Stage Transition`,
      `App: ${app} | ${from} -> ${to} | Status: ${status}`,
      duration ? `Duration: ${duration}` : null,
      reason ? `Reason: ${reason}` : null,
      ''
    ].filter(Boolean).join('\n');

    fs.appendFileSync(path.join(logsDir, 'stage-transitions.md'), lines + '\n');
  }

  ctx.log.info('stage', `Loaded: ${JSON.stringify(state)}`);
  return { requestTransition, handleStageAck, getStage, getAllStages, isValidProgression };
}

module.exports = { init };
