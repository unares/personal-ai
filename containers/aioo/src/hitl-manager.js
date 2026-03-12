'use strict';

function init(ctx) {
  ctx.log.info('hitl', 'STUB — not connected (Layer 3)');

  function request(tier, message, taskId) {
    ctx.log.warn('hitl', `Request: tier=${tier} task=${taskId} "${message}"`);
  }

  function handleHumanMessage(envelope) {
    ctx.log.info('hitl', `Human message from ${envelope.from}: ${JSON.stringify(envelope.payload)}`);
    return { acknowledged: true };
  }

  return { request, handleHumanMessage };
}

module.exports = { init };
