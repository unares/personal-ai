'use strict';

function init(ctx) {
  ctx.log.info('brain', 'STUB — not connected (Layer 3)');

  function judge(prompt, context) {
    ctx.log.warn('brain', `NOT CONNECTED: ${prompt.slice(0, 80)}`);
    return {
      decision: 'no-op',
      reasoning: 'Brain not connected (Layer 3)',
      tokens: 0
    };
  }

  return { judge };
}

module.exports = { init };
