'use strict';

function init(ctx) {
  const counters = { brain: 0, agents: 0 };
  ctx.log.info('cost', 'STUB — in-memory only (Layer 3)');

  function track(source, tokens) {
    if (counters[source] !== undefined) {
      counters[source] += tokens;
    }
  }

  function handleAgentReport(envelope) {
    const tokens = envelope.payload.tokens || 0;
    track('agents', tokens);
    ctx.log.info('cost', `Agent tokens: +${tokens} (total: ${counters.agents})`);
  }

  function getSummary() {
    return { ...counters, total: counters.brain + counters.agents };
  }

  return { track, handleAgentReport, getSummary };
}

module.exports = { init };
