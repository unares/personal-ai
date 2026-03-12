'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, ensureDir } = require('./util');

function init(ctx) {
  const costsDir = path.join(ctx.vaultDir, 'Logs', 'costs');
  const statePath = path.join(costsDir, 'current.json');
  ensureDir(costsDir);

  let state = loadState();

  function freshState() {
    return {
      brain: 0, agents: 0,
      byStage: { demo: 0, testing: 0, launch: 0, scaling: 0 },
      dailyTotal: 0,
      lastReset: today()
    };
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadState() {
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
      return freshState();
    }
  }

  function save() {
    atomicWriteJson(statePath, state);
  }

  function resetIfNewDay() {
    if (state.lastReset !== today()) {
      writeDailySummary(state);
      state = freshState();
      save();
    }
  }

  function track(source, tokens) {
    resetIfNewDay();
    if (source === 'brain') {
      state.brain += tokens;
    } else {
      state.agents += tokens;
    }
    state.dailyTotal += tokens;
    save();
    checkBudget();
  }

  function handleAgentReport(envelope) {
    const { tokens = 0, stage } = envelope.payload;
    track('agents', tokens);
    if (stage && state.byStage[stage] !== undefined) {
      state.byStage[stage] += tokens;
      save();
    }
    ctx.log.info('cost', `Agent: +${tokens} stage=${stage || '?'} (total: ${state.agents})`);
  }

  function getSummary(activeAppCount = 1) {
    const n = Math.max(activeAppCount, 1);
    return {
      brain: state.brain,
      agents: state.agents,
      byStage: { ...state.byStage },
      total: state.brain + state.agents,
      dailyTotal: state.dailyTotal,
      amortizedPerApp: Math.round(state.brain / n),
      activeApps: n
    };
  }

  function checkBudget() {
    const budget = ctx.config.dailyBudgetTokens;
    if (!budget || state.dailyTotal <= budget) return;
    ctx.log.warn('cost', `Budget exceeded: ${state.dailyTotal}/${budget}`);
    if (ctx.hitl) {
      ctx.hitl.requestForSituation(
        'budget-alert',
        `Token budget exceeded: ${state.dailyTotal}/${budget}`,
        null
      );
    }
  }

  function writeDailySummary(data) {
    const file = path.join(costsDir, `${data.lastReset}.json`);
    atomicWriteJson(file, {
      date: data.lastReset,
      entity: ctx.entity,
      brain: data.brain,
      agents: data.agents,
      byStage: data.byStage,
      total: data.brain + data.agents
    });
    ctx.log.info('cost', `Daily summary: ${data.lastReset}`);
  }

  ctx.log.info('cost', `Loaded: brain=${state.brain} agents=${state.agents} daily=${state.dailyTotal}`);
  return { track, handleAgentReport, getSummary };
}

module.exports = { init };
