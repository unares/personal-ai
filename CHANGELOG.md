# Changelog

All notable changes to Personal AI Workspace.

## [0.5.4] — 2026-03-13

### Added
- Layer 4: NanoClaw-PAW — persistent container routing, Clark lifecycle
  management, credential proxy, clark-net isolation (`services/nanoclaw-paw/`)
- Layer 3: AIOO Brain Client (Gemini 3.1 Pro via ai-gateway), HITL Manager
  (3-tier rules, 12 situation mappings, escalation), Stage Controller
  (sequential validation, state persistence), Cost Tracker (per-stage +
  amortized daily summaries, budget alerts)
- Layer 2: AIOO daemon skeleton — 8-module Node.js process, async event loop,
  IPC wiring, task graph, health monitor
- Layer 1: Docker Compose rewrite — per-entity networks, profile activation,
  Chronicle dual-network, ai-gateway per-entity configs
- Layer 0: IPC shared library — Typed Envelope filesystem protocol (`lib/ipc/`),
  atomic writes, 1s polling, processed/ audit trail
- `architecture-build` skill: spec-analyst + build-validator subagents (Opus 4.6)
- `github-discipline` skill: git-status + handoff subagents
- Clark + NanoClaw-PAW design decisions (`clark-decisions.md`, `nanoclaw-paw-decisions.md`)
- Authoritative build order in ARCHITECTURE.md
- NORTHSTAR copy-friendly path rule in technical profile
- `nanoclaw-config/routing.json` — channel → Clark/AIOO routing config

### Changed
- AIOO event loop made async throughout
- AIOO config expanded: brain model, daily budget, 12 HITL situation rules
- Specs updated: clark.md (clark-net), nanoclaw-paw.md (persistent routing decisions)
- ARCHITECTURE.md: Layer 4 marked complete, Layers 5+6 unblocked
- spec-analyst and build-validator agents pinned to Opus 4.6
- github-discipline decoupled from architecture-build (independent skill)
- architecture-build + architecture-design skills updated with Layer 4 retrospective
  improvements (stub scope, cross-spec consistency, fork touchpoint metric)

### Tests
- IPC shared library: 23/23 pass
- AIOO daemon: 56/56 pass (8 test files)
- NanoClaw-PAW: 14 PAW + 201 upstream = 215/215 pass

## [0.5.3] — 2026-03-12

### Added
- Full system spec-engineering: 11 specs across ai-workspace/Specifications/
  (aioo, clark, nanoclaw-paw, app-dev-stages, ai-gateway, stage-lifecycle,
  ipc-protocol, security-patterns, docker-compose-topology, host-watchdog,
  jtbd-specification-engineering)
- Chronicle container — always-on vault watcher + QMD hybrid search (FTS5 +
  sqlite-vec + GGUF reranker), MCP HTTP on :8181
- `architecture-design` skill: co-design mode with grading, teaching, AI-era patterns
- Claude Code profiles: technical + non-technical, profile switching via `./claude.sh`
- Vault selective git tracking: ARCHITECTURE.md, Specifications/, NORTHSTAR, GLOSSARY
- Context Extractor spec (deferred — design after AIOO built)

### Changed
- ARCHITECTURE.md rewritten as shared vault root (all entities)
- Entity model established: ai-workspace (meta), procenteo + inisio (app-factory)
- JTBD + Specification Engineering adopted as system philosophy
