# Personal AI Workspace — Global Claude Configuration

This document is the canonical reference for how Claude Code is configured across the
entire Personal AI Workspace: profiles, session contexts, skills, agents, NanoClaw-PAW
integration, and how `participate.sh` works.

---

## 1. CLAUDE.md Stack

Claude Code loads CLAUDE.md files in order from global → project, with project taking
precedence. Each launch context has a specific stack:

```
┌─ Host: personal-ai/ (ai-workspace, technical only) ──────────────────────┐
│  ~/.claude/CLAUDE.md           ← profile (generic operating rules)        │
│    source: profiles/technical/CLAUDE.md                                   │
│  personal-ai/CLAUDE.md         ← project context                          │
│    @-imports: AI_WORKSPACE_NORTHSTAR.md                                   │
│               AI_WORKSPACE_GLOSSARY.md                                    │
│               memory-vault/ARCHITECTURE.md                                │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Stage Container: /workspace (entity app dev, technical + non-technical) ─┐
│  ~/.claude/CLAUDE.md           ← profile (from /vault)                    │
│    source: /vault/ai-workspace/Claude/Templates/Profiles/{role}.md        │
│  /workspace/CLAUDE.md          ← project context (entity-specific)        │
│    template: memory-vault/{entity}/Claude/CLAUDE.md                       │
│    @-imports: /vault/{entity}/{ENTITY}_NORTHSTAR.md                       │
│               /vault/{entity}/{ENTITY}_GLOSSARY.md                        │
│               /vault/ARCHITECTURE.md                                      │
└───────────────────────────────────────────────────────────────────────────┘
```

**Key rule**: NORTHSTAR and GLOSSARY stay at entity root (human-owned, multi-agent
accessible). ARCHITECTURE.md stays at vault root (cross-entity). Only session-specific
context lives under `Claude/`.

**Exclusions**: NanoClaw-PAW's own `.claude/` is excluded from workspace sessions via
`claudeMdExcludes` in `.claude/settings.json` and both profile settings.json files.
See Section 7 for details.

---

## 2. Profiles

Two profiles. Source lives in `profiles/`. Injected into `~/.claude/CLAUDE.md` at
launch by `participate.sh`.

| Profile | Who | Launch restriction | Source |
|---------|-----|--------------------|--------|
| technical | Michal | personal-ai/ or app-workspaces/ | memory-vault/ai-workspace/Claude/Templates/Profiles/technical.md |
| non-technical | Co-founders | app-workspaces/ only | memory-vault/ai-workspace/Claude/Templates/Profiles/non-technical.md |

Currently identical in content — non-technical will diverge as the system matures.
Restriction is enforced in `participate.sh`, not in the CLAUDE.md content.

### Single source of truth

```
memory-vault/ai-workspace/Claude/Templates/Profiles/
  technical.md      ← used by both host and container sessions
  non-technical.md  ← used by both host and container sessions
```

`participate.sh` reads directly from `memory-vault/` on the host, and from
`/vault/` in containers. No copies, no sync required. `profiles/{name}/CLAUDE.md`
files no longer exist — only `settings.json` and `profile.json` remain in `profiles/`.

---

## 3. participate.sh

`participate.sh` is the single entry point for launching Claude Code in any context.
Located at the project root: `personal-ai/participate.sh`.

### What it does

1. Detects `HUMAN_NAME` and `ENTITY` from env or `config.json`
2. Shows vault access summary and GitHub status
3. **Container mode** (if `/.dockerenv` present): reads profile from vault, skips picker
4. **Host mode**: shows interactive profile picker (or accepts `--technical` / `--non-technical` flag)
5. Enforces non-technical restriction (must be in `app-workspaces/`)
6. Injects identity into `~/.claude/settings.json` (HUMAN_NAME, ENTITY, ROLE)
7. Copies profile CLAUDE.md to `~/.claude/CLAUDE.md`
8. Checks context sync staleness (warns if > 24h)
9. Logs the session to `{vault}/{entity}/Logs/sessions.jsonl`
10. Syncs auto-memory (`setup/sync-memory.sh`)
11. Launches `claude --dangerously-skip-permissions`

### Usage

```bash
./participate.sh                  # interactive profile picker
./participate.sh --technical      # direct launch (Michal)
./participate.sh --non-technical  # direct launch (co-founders, app-workspaces/ only)
./participate.sh --help
```

### Container mode flow

```
/.dockerenv detected
  → ROLE env var (set at docker run time, defaults to "technical")
  → reads /vault/ai-workspace/Claude/Templates/Profiles/{ROLE}.md
  → writes to ~/.claude/CLAUDE.md
  → skips profiles/ dir, config.json, interactive picker
  → launches claude
```

---

## 4. Settings

### Project settings: `.claude/settings.json`

Applied to all sessions launched from `personal-ai/`.

Key entries:
- `claudeMdExcludes: ["**/services/nanoclaw-paw/**"]` — blocks NanoClaw's CLAUDE.md
- `env`: ENTITY, HUMAN_NAME, ROLE defaults
- `permissions.allow`: full bash/docker/git/web allowlist

### Profile settings: `profiles/{name}/settings.json`

Merged into `~/.claude/settings.json` at launch by `participate.sh`. Includes the same
`claudeMdExcludes` rule. HUMAN_NAME and ENTITY are injected dynamically from env/config.json.

### NanoClaw-PAW settings: `services/nanoclaw-paw/.claude/settings.json`

Applied when running Claude Code from inside the NanoClaw-PAW subtree.

Key entry:
- `claudeMdExcludes: ["**/personal-ai/CLAUDE.md"]` — blocks parent project CLAUDE.md,
  ARCHITECTURE.md, and entity NORTHSTAR (all @-imported from personal-ai/CLAUDE.md)

---

## 5. Skills

Skills live in `.claude/skills/` (project-level). Discovered automatically by Claude Code
for sessions launched from `personal-ai/`. All skills below are workspace-builder skills —
they guide Claude in specific workflows.

```
.claude/skills/
  architecture-design/     ← co-design sessions: JTBD, spec engineering, grading
    SKILL.md
    reference.md           ← 11 patterns, anti-patterns, scale transitions
    agents/spec-reviewer.md
  architecture-build/      ← implementation from specs: analyst + validator agents
    SKILL.md
    agents/spec-analyst.md
    agents/build-validator.md
  context-ops/             ← vault search, distillation, context queries
    SKILL.md
  github-discipline/       ← git status, branch proposals, PR generation
    SKILL.md
    agents/github-status.md
  glossary-watch/          ← terminology monitoring, glossary suggestions
    SKILL.md
```

**NanoClaw-PAW skills** (`services/nanoclaw-paw/.claude/skills/`) are also discovered
due to Claude Code's monorepo scan. They appear in `/context` output but are NOT in
Claude's system-reminder for workspace sessions — they cannot be invoked accidentally.
Human risk: typing `/setup` or `/add-telegram` directly in terminal will run the NanoClaw
version. Avoid this in workspace sessions.

---

## 6. Agents

Sub-agents used by skills. Live in `.claude/agents/` (project-level) and inside skill
directories under `.claude/skills/{skill}/agents/`.

```
.claude/agents/
  architecture-analyst.md   ← deep spec and architecture analysis
  code-reviewer.md          ← code quality review
  researcher.md             ← research tasks, saves to Research/
  vault-ops.md              ← vault read/write operations
```

These are internal to Claude Code sessions. Not to be confused with companion AI agents
(Clark, AIOO) which are separate Docker containers.

---

## 7. NanoClaw-PAW and Claude

NanoClaw-PAW is a host process (git subtree at `services/nanoclaw-paw/`). It interacts
with Claude in two ways:

### Agent spawning (docker exec)

PAW spawns Claude Code CLI inside stage containers via `docker exec`:
```
docker exec {container} claude --print "{prompt}"
```
The stage container's `~/.claude/CLAUDE.md` provides the agent identity.
Credential proxy (port 3001) ensures API keys never enter the container directly.

### Clark spawning (ephemeral containers)

PAW spawns Clark containers on message via `docker run --rm`:
```
containers/ephemeral-companion/ → ephemeral-companion:latest image → ~/.claude/CLAUDE.md = clark identity
```
Clark containers connect via `ephemeral-companion-net` (air-gapped from entity networks).
30-min idle timeout. PAW manages the full lifecycle.

### NanoClaw's own Claude context

NanoClaw-PAW has its own `.claude/` at `services/nanoclaw-paw/.claude/`:
- `settings.json`: excludes parent project CLAUDE.md
- `skills/`: NanoClaw-specific skills (add-telegram, setup, customize, etc.)

When a human runs `claude` inside `services/nanoclaw-paw/`, they get NanoClaw's context,
not the workspace's. This is intentional — NanoClaw development is a separate context.

---

## 8. Entity Configuration

### Meta-entity: ai-workspace

Used for workspace infrastructure work (this repo). Launched from `personal-ai/`.

```
CLAUDE.md stack:
  ~/.claude/CLAUDE.md         ← profiles/technical/CLAUDE.md
  personal-ai/CLAUDE.md       ← @-imports ai-workspace NORTHSTAR + GLOSSARY + ARCHITECTURE
Vault: memory-vault/ai-workspace/
Skills: all workspace-builder skills available
```

### App-factory entities: procenteo, inisio

Used for app development in stage containers.

```
CLAUDE.md stack (container):
  ~/.claude/CLAUDE.md                               ← vault profile template
  /workspace/CLAUDE.md                              ← memory-vault/{entity}/Claude/CLAUDE.md
    @/vault/{entity}/{ENTITY}_NORTHSTAR.md
    @/vault/{entity}/{ENTITY}_GLOSSARY.md
    @/vault/ARCHITECTURE.md
Vault: memory-vault/{entity}/ (mounted at /vault/{entity}/ in container)
Workspace: app-workspaces/{entity}/{app}-app-{stage}/ (mounted at /workspace/)
```

### Adding a new entity

`setup/add-entity.sh` is currently disabled. New entities are added manually:

1. Create vault structure:
   ```
   memory-vault/{entity}/
     {ENTITY}_NORTHSTAR.md    ← from Templates/Entity/_NORTHSTAR.md
     {ENTITY}_GLOSSARY.md     ← from Templates/Entity/_GLOSSARY.md
     Claude/CLAUDE.md         ← from memory-vault/{entity}/Claude/CLAUDE.md pattern
     Raw/, Memories/, Distilled/, Logs/, Bin/
   ```
2. Add entity to `config.json` (entities array, clarks array)
3. Add gitignore negation rules (same pattern as procenteo/inisio in `.gitignore`)

---

## 9. Template Sources

```
memory-vault/ai-workspace/Claude/Templates/
  Profiles/
    technical.md        ← profile CLAUDE.md for container sessions (technical)
    non-technical.md    ← profile CLAUDE.md for container sessions (non-technical)
  Entity/
    _NORTHSTAR.md       ← blank NORTHSTAR template for new entities
    _GLOSSARY.md        ← blank GLOSSARY template for new entities
```

`profiles/technical/CLAUDE.md` and `memory-vault/.../Profiles/technical.md` must be
kept in sync — they are the same content, one for host use and one for container use.
