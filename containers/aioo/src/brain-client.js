'use strict';

const http = require('node:http');

function init(ctx) {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY || '';
  const model = ctx.config.brainModel || 'gemini-planning';

  if (!gatewayUrl) {
    ctx.log.warn('brain', 'AI_GATEWAY_URL not set — brain disabled');
  }

  async function judge(prompt, context) {
    if (!gatewayUrl) {
      return { decision: 'no-op', reasoning: 'No gateway configured', tokens: 0 };
    }

    const messages = buildMessages(prompt, context);
    try {
      const res = await callGateway(messages, model);
      const tokens = res.usage?.total_tokens || 0;
      if (ctx.cost) ctx.cost.track('brain', tokens);
      const parsed = parseResponse(res.choices?.[0]?.message?.content || '');
      ctx.log.info('brain', `Judge: ${parsed.decision} (${tokens} tokens)`);
      return { ...parsed, tokens };
    } catch (err) {
      ctx.log.error('brain', `Gateway error: ${err.message}`);
      return { decision: 'error', reasoning: err.message, tokens: 0 };
    }
  }

  async function classify(prompt) {
    if (!gatewayUrl) return { category: 'unknown', tokens: 0 };
    const classifierModel = ctx.config.brainClassifierModel || 'gemini-classifier';
    try {
      const res = await callGateway(
        [{ role: 'user', content: prompt }],
        classifierModel
      );
      const tokens = res.usage?.total_tokens || 0;
      if (ctx.cost) ctx.cost.track('brain', tokens);
      return { category: (res.choices?.[0]?.message?.content || '').trim(), tokens };
    } catch (err) {
      ctx.log.error('brain', `Classifier error: ${err.message}`);
      return { category: 'error', tokens: 0 };
    }
  }

  function buildMessages(prompt, context) {
    const system = [
      `You are AIOO, the AI Operating Officer for entity: ${ctx.entity}.`,
      'Respond with JSON: {"decision": "action-name", "reasoning": "why"}',
      'Valid decisions: create-tasks, spawn-agent, request-hitl, stage-transition, no-op'
    ].join('\n');

    const user = context
      ? `Context:\n${JSON.stringify(context, null, 2)}\n\nRequest:\n${prompt}`
      : prompt;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }

  function handleGatewayResponse(res, resolve, reject) {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 400) {
        return reject(new Error(`Gateway ${res.statusCode}: ${data.slice(0, 200)}`));
      }
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
    });
  }

  function callGateway(messages, modelName) {
    return new Promise((resolve, reject) => {
      const endpoint = new URL(`${gatewayUrl}/chat/completions`);
      const body = JSON.stringify({ model: modelName, messages, temperature: 0.2 });

      const req = http.request({
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      }, res => handleGatewayResponse(res, resolve, reject));

      req.on('error', reject);
      req.setTimeout(30000, () => req.destroy(new Error('Gateway timeout (30s)')));
      req.write(body);
      req.end();
    });
  }

  function parseResponse(content) {
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        return { decision: obj.decision || 'no-op', reasoning: obj.reasoning || content };
      }
    } catch { /* fall through */ }
    return { decision: 'no-op', reasoning: content };
  }

  ctx.log.info('brain', gatewayUrl
    ? `Ready: ${gatewayUrl} (model: ${model})`
    : 'Disabled — no AI_GATEWAY_URL');

  return { judge, classify };
}

module.exports = { init };
