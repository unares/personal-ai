# NanoClaw-PAW — Design Decisions

> Pre-build decisions resolved before Layer 4 implementation.
> Date: 2026-03-12

## P1: Code Location and Git Strategy

**Decision:** `services/nanoclaw-paw/` in the workspace repo as a **git subtree**.

**Why subtree, not submodule:** Submodules require a separate hosted GitHub repo.
Michal does not want a separate repo. Git subtree embeds NanoClaw in the workspace
repo as regular files — single repo, no separate GitHub repo, upstream sync preserved.

**Commands:**
```bash
# Initial pull (once, during build):
git subtree add --prefix=services/nanoclaw-paw \
  https://github.com/qwibitai/nanoclaw main --squash

# Pull upstream updates later:
git subtree pull --prefix=services/nanoclaw-paw \
  https://github.com/qwibitai/nanoclaw main --squash
```

**Rationale:** NanoClaw spec constraint requires upstream sync ("updates can be
pulled with minimal conflict"). Subtree satisfies this within a single repo.
Host processes belong in `services/`, not `containers/`.

## P2: Agent Spawn Mechanism

**Decision:** `docker exec` + Claude Code CLI in print mode.

**How it works:**
```
AIOO sends spawn-agent IPC → PAW reads it →
PAW runs: docker exec {stage-container} claude -p "{task}" →
Claude executes, exits → PAW collects output →
PAW sends agent-report IPC back to AIOO
```

**Key details:**
- Fully automatic — no human involvement
- NOT `participate.sh` (that's the interactive human entry point)
- Raw `claude -p` inside the container (non-interactive, one-shot)
- Stage containers need Claude Code CLI installed in their image (Layer 6)
- NanoClaw-PAW is NOT a Claude instance — it's a Node.js orchestrator
- No separate profile needed for PAW
- Against placeholder stage containers: agent-report returns `status: failed` (correct behavior)

**Rationale:** Simplest mechanism. Host has Docker access. No agent infrastructure
needed inside stage containers beyond Claude CLI. `docker exec` works with
already-running Compose-managed containers. Upstream NanoClaw's `agent-runner`
pattern evaluated — more complex than needed for Phase 1.

## P3: Credential Proxy

**Decision:** Upstream NanoClaw pattern, port 3001, per-entity JSON config.
Anthropic-only for Phase 1.

**Scope clarification:** Two credential isolation layers exist:
- **ai-gateway (LiteLLM):** For containers on entity networks (AIOO, stage containers).
  Handles LLM routing, model aliasing, cost tracking. Keys: Gemini, Claude, per-entity.
- **Credential proxy (NanoClaw pattern):** For Clark on ephemeral-companion-net (can't reach ai-gateway).
  Simple HTTP header injection. Keys: Anthropic only.

The credential proxy pattern IS extensible to other APIs and per-entity credentials,
but Phase 1 serves one consumer (Clark). Expand when a second off-network consumer appears.

**Rationale:** Proven pattern from upstream NanoClaw. ai-gateway already handles
credential isolation for everything on entity networks. No duplication needed.

## P4: Clark Network Model

**Decision:** Option B — Infrastructure air-gap. Clark runs on `ephemeral-companion-net`.

**Full decision documented in:** `clark-decisions.md` (decision D1).

**Summary:** `--network none` was a spec bug — blocks credential proxy (Clark can't
call Anthropic API). `ephemeral-companion-net` provides internet access for credential proxy while
maintaining air-gap from entity networks (procenteo-net, inisio-net). PAW relays
human messages via filesystem IPC. Clark is a self-contained thinking agent.

## P5: Stage Health Checks

**Decision:** Use Docker's built-in health status, not custom HTTP endpoints.

**How it works:**
```
PAW runs: docker compose --profile {app}-app-{toStage} up -d
PAW polls: docker inspect --format='{{.State.Health.Status}}' {container}
  → healthy: proceed with old stage down
  → unhealthy after 120s: keep old stage, send failure ack
```

**Rationale:** Stage containers define health checks in docker-compose.yml. Docker
reports health status. No custom HTTP endpoints needed. When real stage containers
replace placeholders, they define proper health checks in their Dockerfile/compose
config. PAW just reads what Docker already knows.

## P6: Host Restart Mechanism

**Decision:** Shell wrapper with restart-on-exit for Phase 1.

**Implementation:**
```bash
#!/bin/bash
# services/nanoclaw-paw/run.sh
while true; do
  node src/index.js
  echo "NanoClaw-PAW exited with code $?. Restarting in 5s..."
  sleep 5
done
```

**Upgrade path:** launchd plist (macOS) or systemd unit (Linux VPS) when
the system moves beyond local development.

**Rationale:** Simplest restart mechanism. Host watchdog (Layer 7) provides
health monitoring separately. No need for process managers in Phase 1.

## P7: Multi-Entity IPC Polling

**Decision:** Single event loop, sequential reads of all entity directories per tick.

**How it works:**
```
Every 1s tick:
  read ipc/aioo-procenteo/to-paw/  → route messages
  read ipc/aioo-inisio/to-paw/     → route messages
  read ipc/watchdog/pings/          → respond with pong
```

**Rationale:** 3 directories at 1s intervals = negligible overhead. Same pattern
as AIOO's event loop (already built, proven). Config lists active entities so
the polling set is dynamic. No need for file watchers or event-driven IO.

## P8: NanoClaw Setup and Operation Workflow

**Decision:** NanoClaw-PAW is set up via Claude Code CLI + `/setup` skill.
Runtime is a Node.js process (`node src/index.js`).

**Key distinction:**

| Phase | How | Claude involved? |
|-------|-----|-----------------|
| Build PAW extensions | Workspace root → `/architecture-build` | Yes (workspace skills) |
| Initial setup | `cd services/nanoclaw-paw && claude && /setup` | Yes (NanoClaw skills) |
| Runtime | `node src/index.js` or launchctl service | No |
| Add channel | `cd services/nanoclaw-paw && claude && /add-telegram` | Yes (NanoClaw skills) |
| Pull upstream | `git subtree pull ...` (shell) | No |

**NanoClaw's own skill system (23 skills in `.claude/skills/`):**
`/setup`, `/add-whatsapp`, `/add-telegram`, `/add-discord`, `/add-slack`,
`/customize`, `/debug`, `/update-nanoclaw`, `/update-skills`, etc.

**CLAUDE.md collision:** When running `claude` inside `services/nanoclaw-paw/`,
both workspace CLAUDE.md and NanoClaw's context load. This is acceptable —
workspace skills (architecture-build, etc.) and NanoClaw skills (/add-telegram, etc.)
serve different purposes and don't conflict.

**NanoClaw's CLAUDE.md system for agents:**
Per-group `groups/{group}/CLAUDE.md` injected into Agent SDK containers.
PAW extensions live in `nanoclaw-config/` (already in use by Clark).

**Research:** `memory-vault/ai-workspace/Research/nanoclaw-setup-claude-cli.md`

## References

- NanoClaw-PAW spec: `./nanoclaw-paw.md`
- Clark decisions (D1): `./clark-decisions.md`
- AIOO decisions (A1-A6): `./aioo-decisions.md`
- IPC protocol: `./ipc-protocol.md`
- Security patterns: `./security-patterns.md`
