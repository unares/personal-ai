# ai-gateway — Specification

> Per-entity LLM proxy for routing, cost tracking, and Return on Tokens.
> Date: 2026-03-11

## JTBD

"When my agents make LLM calls, I want per-entity cost tracking and
model routing, so I can measure Return on Tokens and manage budgets
independently for each app-factory entity."

## The 5 Primitives

### 1. Problem Statement

Each app-factory entity makes LLM calls through Agent SDK subprocesses
in AIOO and App Dev Stage containers. These calls need per-entity API
key isolation, cost tracking (Return on Tokens), rate limiting, and
model routing. A shared proxy would mix entity metrics and create a
single point of failure. Per-entity ai-gateways keep each entity
self-contained.

### 2. Acceptance Criteria

1. All Agent SDK calls from an entity's containers route through that
   entity's ai-gateway — no direct Anthropic API calls from containers.
2. Cost dashboard shows per-entity, per-model, per-day token usage
   accessible via ai-gateway admin interface.
3. If one entity's ai-gateway goes down, the other entity's agents
   continue working unaffected.

### 3. Constraint Architecture

**Must do:**
- One ai-gateway instance per app-factory entity
- Configure per-entity API keys, model preferences, budgets
- Track token usage per model, per container, per day
- Rate limit to prevent runaway agent spend

**Must not do:**
- Share API keys across entities
- Allow containers to bypass the ai-gateway (direct API calls)
- Run an ai-gateway for the meta-entity (human uses Claude Code directly)

**Preferences:**
- Use LiteLLM as the underlying technology (mature, supports all providers)
- Compose-managed (static infrastructure, always-on)
- Minimal configuration — one config file per entity

**Escalation triggers:**
- Token spend exceeds daily budget → alert via NanoClaw-PAW messaging
- ai-gateway latency > 500ms → investigate provider issues

### 4. Decomposition

| Subtask | Description |
|---------|-------------|
| 1. LiteLLM setup | Docker image, basic configuration |
| 2. Per-entity config | API keys, model routing, rate limits per entity |
| 3. Compose service | Add to docker-compose.yml as static infrastructure |
| 4. Container routing | Configure AIOO and stage containers to use ai-gateway |
| 5. Cost dashboard | Enable LiteLLM admin UI for RoT measurement |
| 6. Budget alerts | Configure spend alerts via NanoClaw-PAW messaging |

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| Agent SDK call from AIOO-procenteo | Routed through ai-gateway-procenteo |
| Check ai-gateway-procenteo logs | Shows token usage for procenteo only |
| Stop ai-gateway-procenteo | ai-gateway-inisio unaffected |
| Exceed rate limit | Agent call returns rate limit error, alert sent |

## Container Names

- `ai-gateway-procenteo`
- `ai-gateway-inisio`

## References

- NanoClaw-PAW credential proxy: `./nanoclaw-paw.md` (complementary —
  NanoClaw-PAW proxies credentials for messaging/Clark; ai-gateway
  proxies for Agent SDK LLM calls)
- Architecture: `memory-vault/ARCHITECTURE.md`
