'use strict';

const DEFAULT_RULES = {
  'stage-transition': 'micro',
  'budget-alert': 'micro',
  'agent-clarification': 'micro',
  'agent-failed-3x': 'micro',
  'gateway-down': 'micro',
  'define-outcomes': 'light',
  'review-priorities': 'light',
  'feature-requirements': 'light',
  'review-quality': 'light',
  'entity-setup': 'heavy',
  'debug-agents': 'heavy',
  'architecture': 'heavy'
};

const TIER_RANK = { micro: 1, light: 2, heavy: 3 };

function init(ctx) {
  const rules = { ...DEFAULT_RULES, ...(ctx.config.hitlRules || {}) };

  function selectTier(situation) {
    return rules[situation] || 'micro';
  }

  function escalate(baseTier, brainTier) {
    const baseRank = TIER_RANK[baseTier] || 1;
    const brainRank = TIER_RANK[brainTier] || 0;
    return brainRank > baseRank ? brainTier : baseTier;
  }

  function request(tier, message, taskId) {
    const payload = {
      text: `[${ctx.entity}] ${message}`,
      hitlTier: tier,
      taskId: taskId || null
    };

    ctx.ipc.send('human-reply', 'nanoclaw-paw', payload);
    ctx.log.info('hitl', `Sent: tier=${tier} "${message}"`);
    return { tier, message, taskId };
  }

  function requestForSituation(situation, message, taskId) {
    const tier = selectTier(situation);
    ctx.log.info('hitl', `Situation: ${situation} -> ${tier}`);
    return request(tier, message, taskId);
  }

  function handleHumanMessage(envelope) {
    const { channel, human, text } = envelope.payload;
    ctx.log.info('hitl', `From ${human || envelope.from}: "${text}"`);
    return { acknowledged: true, channel, text };
  }

  ctx.log.info('hitl', `Rules: ${Object.keys(rules).length} situations mapped`);
  return { request, requestForSituation, selectTier, escalate, handleHumanMessage };
}

module.exports = { init };
