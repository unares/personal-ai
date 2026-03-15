# AI Workspace — Glossary

> Human-owned terminology. Claude suggests new terms. Human decides.

## Required Terms

| Term | Usage | Never Use |
|------|-------|-----------|
| Personal AI Workspace | The full system name | "PAI", any abbreviation |
| Meta-entity | ai-workspace — proxy of the system, used for evolving it | "default entity" |
| App-factory entity | Entities that use the system to build apps (e.g. procenteo, inisio) | "app entity", "project" |
| Companion AI | AI agents that communicate with humans conversationally via messaging channels (Telegram, WhatsApp, Discord). Includes AIOO, Clark, Unares | "bot", "assistant", "chatbot" |
| SOUL.md | Shared personality and philosophy anchor for all companion AIs at vault root | "personality file", "tone guide" |
| Identity file | Companion-specific identity definition ({COMPANION}_IDENTITY.md) at vault root | "profile", "persona" |
| Vault | The memory-vault directory per entity | "database", "store" |
| Northstar | {ENTITY}_NORTHSTAR.md — human-owned vision | "roadmap", "plan" |
| App Factory | The sequential 4-stage pipeline for building apps | "build pipeline" |
| App Dev Stage | One of 4 stages: Demo (PoC), Testing (MVP), Launch (Product), Scaling (Distribution) | "phase", "step" |
| App Dev Stage Container | Container running a specific stage for a specific app | "stage container" |
| ai-gateway | Per-entity LLM proxy for routing, cost tracking, and RoT | "LiteLLM" (internal name only) |
| NanoClaw | Messaging gateway and ephemeral container router (host process) | "orchestrator" (it's a router, not an orchestrator) |
| NanoClaw-PAW | Targeted NanoClaw fork for Personal AI Workspace — adds persistent container routing | — |
| Filesystem IPC | Inter-process communication via shared files (JSON in shared directories) | — |
| Specification Engineering | Practice of writing agent-executable specs with 5 primitives | — |
| JTBD | Jobs To Be Done — framework for defining outcomes | — |
| HITL | Human-in-the-loop intervention | — |
| Micro-HITL | Small decisions made via messaging (WhatsApp/Telegram/Discord), < 30 sec | — |
| Light-HITL | Structured input via .md file in vault + messaging notification, < 10 min, edited in Obsidian | — |
| Heavy-HITL | Substantial actions requiring human participation via Claude Code CLI, 10 min+ | — |
| HRoT | Human Return on Time | — |
| RoT | Return on Tokens — LLM cost efficiency per entity | — |
| Interface Contract | Per-spec table declaring everything a component reads, writes, and connects to (filesystem, network, protocol, platform). Design-time declaration replaces build-time discovery. | "mount schema", "data residency" (these are categories within the contract) |
| Context Extractor | Service that watches Raw/ → Distilled/ | "parser", "processor" |

## Agent Names

| Agent | Full Title | Role | Scope |
|-------|-----------|------|-------|
| Clark | Clarity Architect | Per-human philosophical brain, think partner | One per human (clark-michal, clark-mateusz, clark-andras) |
| AIOO | AI Operating Officer | Per-entity operational brain, execution driver | One per app-factory entity (aioo-procenteo, aioo-inisio) |
| Unares | Workspace Observer | System-wide visibility, NanoClaw management | One instance, ai-architect profile only (Michal) |

## App Naming Convention

Container names follow `{appname}-app-{stage}`:
- `procenteo-app-demo` (PoC), `procenteo-app-testing` (MVP), `procenteo-app-launch` (Product), `procenteo-app-scaling` (Distribution)
- Entity names are permanent. App names are permanent within their entity.
- First apps in procenteo and inisio share their entity names. Future apps will differ.

## Prohibited Patterns

- Never abbreviate "Personal AI Workspace" to "PAI" or any other form
- Never call an entity a "company" or "project"
- Never call a companion AI a "bot"
- Never call NanoClaw an "orchestrator" — it's a messaging gateway and container router
- Never use "LiteLLM" in user-facing docs — use "ai-gateway"
