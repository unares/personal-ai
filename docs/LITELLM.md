# LiteLLM Proxy — Cost Engineering Layer

> Do One Thing. Earn Full Autonomy.

LiteLLM is the external proxy that enables hybrid LLM routing: Gemini 3.1 Pro for planning/reasoning (cheap, 1M context), Claude for tool execution (superior tool-use fidelity).

## How It Works

```
NanoClaw Agent → ANTHROPIC_BASE_URL → LiteLLM Proxy → Gemini 3.1 Pro (planning)
                                                      → Claude (execution/fallback)
```

LiteLLM translates between the Anthropic Messages API (which NanoClaw speaks) and Google's Gemini API. Zero code changes to NanoClaw — it thinks it's talking to Claude.

## Configuration

**litellm/litellm-config.yaml** defines model routing:
- `gemini-planning` → Gemini 3.1 Pro (default for AIOO planning tasks)
- `gemini-classifier` → Gemini Flash (used by hybrid-router skill for classification, <200 tokens)
- `claude-native` → Real Claude Sonnet (for tool-heavy execution)
- Fallback: if Gemini fails, automatically routes to Claude

**Environment variables** (in `.env`):
- `GEMINI_API_KEY` — Google AI Studio API key
- `ANTHROPIC_API_KEY` — Anthropic API key (for Claude fallback)
- `LITELLM_MASTER_KEY` — Any string for LiteLLM auth

## Cost Savings

| Model | Input / Output per 1M tokens | Typical monthly (heavy use) |
|-------|------------------------------|----------------------------|
| Claude Sonnet (native) | $3 / $15 | $120-250 |
| Gemini 3.1 Pro (via proxy) | $2 / $12 | $55-110 |
| Hybrid (Gemini planning + Claude execution) | mixed | $50-90 (55-70% savings) |

---

## Mission Alignment
Cost engineering enables sustained autonomy. Cheaper sessions = longer sessions = more done per dollar. Every dollar saved on planning tasks is a dollar available for execution quality.

## Scope
External LLM proxy configuration and routing. Does NOT define agent behavior or NanoClaw internals. LiteLLM runs as a Docker Compose sidecar with zero coupling to agent code.

## Interfaces
- **Read by**: NanoClaw agents (via HTTP), humans (monitoring cost savings)
- **Written by**: Human (system architect)
- **Depends on**: Docker Compose, API keys, litellm-config.yaml

## Outcomes
- 55-70% cost reduction on heavy agent workloads
- Zero code changes to NanoClaw or agent logic
- Automatic fallback from Gemini to Claude on failure
- Swappable proxy layer (LiteLLM → OpenRouter → custom)

## Gamification Hooks
- [ ] Cost savings %: actual $ saved vs pure Claude baseline → efficiency score
- [ ] Routing accuracy: % of correct model selections by hybrid router → earns more routing autonomy
- [ ] Fallback rate: % of requests that needed Claude fallback → proxy reliability signal
- [ ] Latency impact: avg response time Gemini vs Claude → speed-cost tradeoff visibility

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial LiteLLM proxy spec with Gemini 3.1 Pro routing | System |
