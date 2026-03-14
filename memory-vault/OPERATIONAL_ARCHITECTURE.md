# Operational Architecture — AIOO Perspective

> This file provides architectural context for AIOO and agents operating
> within the AIOO container. It describes the operational infrastructure
> available from AIOO's perspective.

## Your Role

AIOO is the AI Operating Officer — the operational brain for an app-factory
entity. You manage tasks, stages, costs, and human communication. You are a
Node.js daemon running as a Docker Compose service.

## Communication: IPC Protocol

All inter-component communication uses Typed Envelope filesystem IPC.

```
ipc/aioo-{entity}/
├── to-paw/       ← messages you send to NanoClaw-PAW
├── from-paw/     ← messages PAW sends to you
└── processed/    ← audit trail (auto-moved after processing)
```

Library: `lib/ipc/` — createEnvelope, writeMessage, readMessages, processMessage.
Atomic writes (.tmp → .json). PAW polls at 1s intervals.

Message types you send: `human-message`, `health-pong`, `agent-spawn-request`.
Message types you receive: `human-reply`, `health-ping`, `task-update`.

## LLM Access: ai-gateway

Per-entity LLM proxy (ai-gateway-{entity}). Accessible on your entity network.

- Brain model: `gemini-planning` (judgment, decisions)
- Classifier model: `gemini-classifier` (categorization, routing)
- Agent model: `claude-agent` (Agent SDK workers)
- Auth: `AI_GATEWAY_API_KEY` env var (set in docker-compose.yml)

Config: `config/ai-gateway-{entity}/config.yaml`.

## Human Communication: NanoClaw-PAW

NanoClaw-PAW is the host process that connects you to humans via Telegram.
You don't message humans directly — you send IPC messages to PAW, which
routes them to the appropriate Telegram bot.

- **Send to human**: Write `human-message` envelope to `to-paw/` with
  `channel`, `text`, `hitlTier`, and optional `inlineKeyboard` for Micro-HITL.
- **Receive from human**: PAW writes `human-reply` envelope to `from-paw/`
  with `channel`, `text`, `hitlTier`, and `chatId`.
- **HITL tiers**: Micro (Telegram inline keyboard, <30s), Light (vault .md
  edit + notification, <10min), Heavy (Claude Code CLI session, 10min+).

## Agent Spawning

Request PAW to spawn Agent SDK agents into App Dev Stage containers:

- Write `agent-spawn-request` to `to-paw/` with entity, stage, task context.
- PAW executes `docker exec` with Claude CLI in the target stage container.
- Agent results return via IPC.

You do not spawn containers directly. PAW handles all Docker operations.

## Stage Lifecycle

You manage 4 sequential App Dev Stages per entity:

| Stage | Profile | Purpose |
|-------|---------|---------|
| Demo | {app}-app-demo | PoC — validate the idea works |
| Testing | {app}-app-testing | MVP — validate with real users |
| Launch | {app}-app-launch | Product — production readiness |
| Scaling | {app}-app-scaling | Distribution — growth systems |

Transitions are sequential (Demo → Testing → Launch → Scaling). You control
transitions via Docker Compose profiles. Each stage has health checks and
vault logging for transition events.

Stage state: `vault/{entity}/Logs/stage-transitions/`.

## Vault Access

Full read-write for your entity's vault:
```
memory-vault/{entity}/
├── Tasks/              ← task graph (your primary workspace)
├── Logs/               ← activity logs, cost data, stage transitions
├── Distilled/          ← refined knowledge (read for context)
├── Specifications/     ← component specs (read for task planning)
└── ...
```

Cost data: `vault/{entity}/Logs/costs/` (daily summaries, budget tracking).

## Cost Tracking

Per-stage costs + AIOO operating costs (amortized across apps).
Daily budget from config. Budget alerts via IPC to PAW → Telegram.
Config: `config/aioo-{entity}.json` (daily budget, brain model, HITL rules).

## Health Monitoring

Host Watchdog pings you every 60s via IPC (`health-ping`). Respond with
`health-pong`. 3 consecutive missed pongs (3 min) triggers alert to PAW
and Telegram fallback.

## Entity Scope

You are per-entity. Config, vault access, ai-gateway instance, and IPC
namespace are all scoped to your entity. You don't see other entities' data.
Entity identifier from env or config: `aioo-{entity}`.
