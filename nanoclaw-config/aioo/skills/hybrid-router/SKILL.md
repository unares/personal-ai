# Hybrid Router — Agent-Owned LLM Routing with Routing Trace

> Do One Thing. Earn Full Autonomy.

## Trigger
Automatic on every message when `HYBRID_ENABLED=true`.
Manual via `/hybrid-router`, `/audit-routing`, `/toggle-hybrid`, `/set-model`.

## What It Does
Classifies every incoming message and routes to the optimal LLM:
- **Planning/Research** → Gemini 3.1 Pro (via LiteLLM proxy, cheaper, 1M context)
- **Execution/Tool-use** → Claude native (superior tool-use fidelity)

Uses Gemini Flash for classification (~200 tokens, sub-300ms, minimal cost).

## Routing Logic

### Classification Prompt (sent to gemini-classifier)
```
Classify this message as ONE of: PLANNING, EXECUTION

PLANNING = reasoning, analysis, summarization, brainstorming, Q&A, reading comprehension
EXECUTION = code writing, file editing, tool calls, git operations, API calls, container management

Message: "{user_message}"

Reply with ONLY the classification word.
```

### Route Map
| Classification | Model | Via |
|---------------|-------|-----|
| PLANNING | gemini-planning | LiteLLM proxy |
| EXECUTION | claude-native | LiteLLM proxy (passthrough to Anthropic) |
| CLASSIFIER_FAIL | claude-native | Fallback |

## Routing Trace

Every routing decision generates a structured trace logged to `/vault/Logs/routing-traces/{session-id}.md`:

```json
{
  "timestamp": "2026-03-04T10:30:00Z",
  "message_preview": "first 80 chars...",
  "classification": "PLANNING",
  "chosen_model": "gemini-planning",
  "reason": "User asked for strategic analysis — no tool calls needed",
  "confidence": 0.92,
  "estimated_cost_savings": "$0.003",
  "escalation_trigger": null,
  "latency_ms": 180
}
```

### Escalation Triggers
If any of these are detected, override classification to EXECUTION (Claude):
- Message contains file paths or code blocks
- Message asks to "edit", "write", "create", "fix", "build"
- Previous message required tool calls
- Confidence < 0.6

## Commands

### `/toggle-hybrid`
Switch between hybrid routing and Claude-only mode.
```
Current mode: HYBRID (Gemini planning + Claude execution)
Switching to: CLAUDE_ONLY
```

### `/set-model <model>`
Override routing for current session:
- `gemini-pro` — force all to Gemini 3.1 Pro
- `claude-sonnet` — force all to Claude
- `auto` — return to hybrid classification (default)

### `/audit-routing`
Display last 50 Routing Trace entries with summary stats:
```
=== Routing Audit (last 50 decisions) ===
Gemini Planning:  32 (64%)
Claude Execution: 18 (36%)
Fallbacks:         2 (4%)
Avg confidence:   0.87
Est. cost savings: $0.14 (vs all-Claude baseline)
```

## Self-Improvement
Weekly reflection reads accumulated Routing Trace files and suggests:
- Classifier prompt updates (if certain patterns are consistently misrouted)
- Escalation trigger refinements
- Cost optimization opportunities

Results appended to `/vault/Logs/routing-traces/reflections.md`.

## Implementation Notes
- LiteLLM proxy must be running at `LITELLM_BASE_URL` (default: `http://litellm-proxy:4000`)
- Classifier calls use model name `gemini-classifier` (Gemini Flash via LiteLLM)
- Planning calls use model name `gemini-planning` (Gemini 3.1 Pro via LiteLLM)
- Execution calls use model name `claude-native` (Claude Sonnet via LiteLLM passthrough)
- If `HYBRID_ENABLED` is not set or false, all routing goes to Claude (no classifier call)

---

## Mission Alignment
Agent-owned LLM routing puts cost accountability in the agent's hands. Every dollar saved on planning tasks is a dollar available for execution quality. Routing Traces create an immutable audit trail proving the agent makes responsible resource decisions — earning more autonomy.

## Scope
Defines the hybrid routing skill behavior, classification logic, Routing Trace format, and self-improvement cycle. Does NOT define LiteLLM proxy configuration (see docs/LITELLM.md) or NanoClaw internals.

## Interfaces
- **Read by**: AIOO agent (automatic on every message when hybrid enabled)
- **Written by**: Human (system architect)
- **Depends on**: LiteLLM proxy, Gemini API key, Anthropic API key

## Outcomes
- 55-70% cost reduction on planning-heavy workloads
- Full accountability via Routing Trace audit trail
- Automatic fallback prevents service disruption
- Self-improving classifier accuracy over time

## Gamification Hooks
- [ ] Routing accuracy: % correct classifications (validated by outcome) → routing intelligence score
- [ ] Cost savings: actual $ saved vs all-Claude baseline → efficiency score
- [ ] Fallback rate: % needing Claude fallback → proxy reliability signal
- [ ] Self-improvement: classifier prompt updates applied → learning velocity
- [ ] Latency impact: avg response time per model → speed-cost tradeoff visibility

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v1.1: Initial hybrid router with Routing Trace accountability | System |
