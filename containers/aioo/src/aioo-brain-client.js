'use strict';

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

// ── Language Map ────────────────────────────────────────────────────
const LANGUAGE_MAP = { pl: 'Polish', en: 'English' };

// ── Identity Assembly ───────────────────────────────────────────────

const IDENTITY_FILES = [
  { key: 'SOUL', path: '/identity/SOUL.md', label: 'Shared Personality' },
  { key: 'IDENTITY', path: '/identity/AIOO_IDENTITY.md', label: 'Companion Identity' },
  { key: 'NORTHSTAR', pathFn: (e) => `/vault/${e.toUpperCase()}_NORTHSTAR.md`, label: 'Entity Vision' },
  { key: 'GLOSSARY', pathFn: (e) => `/vault/${e.toUpperCase()}_GLOSSARY.md`, label: 'Entity Terminology' },
  { key: 'CLAUDE', path: '/identity/CLAUDE.md', label: 'Operational Context' },
];

function resolveFilePath(fileDef, entity) {
  return fileDef.pathFn ? fileDef.pathFn(entity) : fileDef.path;
}

function readIdentityFile(filePath) {
  try {
    return { content: fs.readFileSync(filePath, 'utf8'), status: 'found' };
  } catch {
    return { content: null, status: 'missing' };
  }
}

function buildDegradedPrompt(entity) {
  return [
    'Respond with JSON: {"decision": "action-name", "reasoning": "why"}',
    'Valid decisions: create-tasks, spawn-agent, request-hitl, stage-transition, no-op',
    `[DEGRADED MODE] No identity files loaded for entity: ${entity}`,
  ].join('\n');
}

function appendLanguage(prompt, config) {
  const lang = config.language;
  if (!lang) return prompt;
  const langName = LANGUAGE_MAP[lang] || lang;
  return prompt + `\n\nLanguage: Communicate in ${langName} (${lang}). Code and logs always in English.`;
}

function assemblePrompt(entity, config, log) {
  const files = {};
  const sections = [];

  for (const fileDef of IDENTITY_FILES) {
    const filePath = resolveFilePath(fileDef, entity);
    const result = readIdentityFile(filePath);
    files[fileDef.key] = result.status;
    if (result.status === 'found') {
      sections.push(`# ${fileDef.label}\n\n${result.content}`);
    } else {
      log.error('brain', `Identity file missing: ${filePath}`);
    }
  }

  let prompt;
  if (sections.length === 0) {
    prompt = buildDegradedPrompt(entity);
    log.error('brain', 'All identity files missing — using degraded fallback');
  } else {
    prompt = sections.join('\n\n---\n\n');
  }

  prompt = appendLanguage(prompt, config);
  const hash = crypto.createHash('sha256').update(prompt).digest('hex');
  return { prompt, hash, files };
}

// ── Init ────────────────────────────────────────────────────────────

function init(ctx) {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY || '';
  const model = ctx.config.brainModel || 'gemini-planning';

  if (!gatewayUrl) {
    ctx.log.warn('brain', 'AI_GATEWAY_URL not set — brain disabled');
  }

  // Assemble identity prompt at startup (Decision IL1)
  const identity = assemblePrompt(ctx.entity, ctx.config, ctx.log);
  const assembledAt = new Date().toISOString();
  ctx.log.info('brain', `prompt hash: sha256:${identity.hash}`);

  // Warn on large prompts (Gemini context budget)
  if (Buffer.byteLength(identity.prompt) > 50 * 1024) {
    ctx.log.warn('brain', 'Assembled prompt exceeds 50KB — Gemini context budget concern');
  }

  function getPromptInfo() {
    return {
      hash: `sha256:${identity.hash}`,
      prompt: identity.prompt,
      files: identity.files,
      language: ctx.config.language || null,
      assembledAt,
    };
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
    const user = context
      ? `Context:\n${JSON.stringify(context, null, 2)}\n\nRequest:\n${prompt}`
      : prompt;
    return [
      { role: 'system', content: identity.prompt },
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

  return { judge, classify, getPromptInfo };
}

module.exports = { init, assemblePrompt, _IDENTITY_FILES: IDENTITY_FILES };
