'use strict';

const DEPRECATED_TERMS = {
  'mvp-sandbox': 'app-builder',
  'Chronicle.db': 'Chronicle vault',
  'Chronicle.sqlite': 'Chronicle vault',
  'Gemini 2.0 Pro': '\u26a0\ufe0f [CONFLICT: verify against NORTHSTAR \u2014 Gemini 3.1 Pro is current]',
  'Context Loader v0.1': 'Context Loader v0.2',
  'NanoClaw-3': '\u26a0\ufe0f [CONFLICT: only 2 NanoClaws exist]',
  'direct vault write': '\u26a0\ufe0f [CONFLICT: agents must use Context Loader API]'
};

const ARCHITECTURE_VIOLATIONS = [
  { pattern: /\b(write|writes|writing)\s+(to|into)\s+\/vault\b/i, type: 'direct_vault_write', recommendation: 'Use POST /ingest or Context Loader API instead of direct vault writes' },
  { pattern: /\bbypass\s+content[- ]?loader\b/i, type: 'bypass_content_loader', recommendation: 'All content must flow through the Context Loader pipeline' },
  { pattern: /\bskip\s+(classification|classify)\b/i, type: 'skip_classification', recommendation: 'Classification is mandatory for all ingested content' },
  { pattern: /\bagent\s+(writes?|edits?|modif(y|ies))\s+(to\s+)?NORTHSTAR\b/i, type: 'northstar_modification', recommendation: 'NORTHSTAR.md is read-only; only humans may edit it' }
];

const PREDICTION_PATTERNS = [
  {
    regex: /\b(will take|should take|estimates?|approximately|about)\s+(\d+)\s*(days?|hours?|weeks?|months?)/gi,
    type: 'time_estimate'
  },
  {
    regex: /\b(should cost|will cost|budget|token budget)\s*[<>\u2248~]?\s*\$?(\d[\d.,]*)/gi,
    type: 'cost_estimate'
  },
  {
    regex: /\b(I expect|I predict|users will|this should result|likely outcome|this will)\b/gi,
    type: 'outcome_prediction'
  },
  {
    regex: /\bif we .{5,60} then .{5,60} will\b/gi,
    type: 'conditional_prediction'
  }
];

function selfHeal(content, deprecatedTerms) {
  const terms = deprecatedTerms || DEPRECATED_TERMS;
  let healed = content;
  const corrections = [];

  for (const [deprecated, replacement] of Object.entries(terms)) {
    const escaped = deprecated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped, 'i').test(healed)) {
      healed = healed.replace(new RegExp(escaped, 'gi'), replacement);
      corrections.push(`${deprecated} \u2192 ${replacement}`);
    }
  }
  return { content: healed, corrections };
}

function detectPredictions(text) {
  const predictions = [];
  for (const { regex, type } of PREDICTION_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      predictions.push({ text: match[0], type, status: 'open' });
    }
  }
  return predictions;
}

function detectArchitectureViolations(text) {
  const violations = [];
  for (const { pattern, type, recommendation } of ARCHITECTURE_VIOLATIONS) {
    const re = new RegExp(pattern.source, pattern.flags);
    const match = re.exec(text);
    if (match) {
      violations.push({ type, text: match[0], recommendation });
    }
  }
  return violations;
}

module.exports = {
  selfHeal, detectPredictions, detectArchitectureViolations,
  DEPRECATED_TERMS, ARCHITECTURE_VIOLATIONS
};
