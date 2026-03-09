# Personal AI v0.4 — Setup Guide

> Do One Thing. Earn Full Autonomy.

## What This Creates

Running `./setup/install.sh` builds your **Personal AI workspace** from scratch — a private, Docker-native Founder OS with isolated memory per entity, AI agents scoped to each project, and a Context Extractor that watches everything you write and turns it into structured context for your agents.

---

## Prerequisites

- **Docker Desktop** running on your Mac (or Docker + Docker Compose on VPS)
- **bash** (pre-installed on Mac)
- No other dependencies. No database setup. No API keys at install time.

---

## Step-by-Step: What Happens During `./setup/install.sh`

### Step 1 — Your Identity
You enter your first name. This creates **your Clark** (`clark-{name}`).

**Clark** is your Clarity Architect — a read-only agent that reads distilled summaries across all your entity vaults and helps you stay focused on the One Thing that matters most. Your Clark has visibility into every entity you own. Co-founders' Clarks are scoped to their entity only.

### Step 2 — Your Entities
You add one entity at a time. For each entity you specify:
- **Name** — becomes the vault folder name and container prefix (e.g. `procenteo` → `aioo-procenteo`)
- **Solo or co-founder** — if co-founder, you enter their name, which creates a scoped `clark-{cofounder}` for them

For each entity, this registers:
- An **AIOO** (`aioo-{entity}`) — your AI Operating Officer. Full read/write access to that entity's vault. Maintains the entity northstar and coordinates work.
- A **co-founder Clark** (if applicable) — read-only access to that entity's `Distilled/Clark/` only.

### Step 3 — Vault & Config Created
Two things are generated:

**`config.json`** (private, gitignored) — the source of truth for your entire setup:
```json
{
  "owner": "michal",
  "clarks": [ { "name": "clark-michal", "projects": ["onething", "procenteo"] } ],
  "entities": [ { "name": "onething", "aioo": "aioo-onething", ... } ]
}
```

**`memory-vault/`** (gitignored) — your private memory layer. See [MEMORY_VAULT.md](MEMORY_VAULT.md) for full spec.

```
memory-vault/
  onething/
    Raw/{owner}/{Clark, Submissions, HITLs, Coding}
    Raw/{AIOO, Clark, Other}
    Processing/
    Distilled/{Clark, AIOO, {owner}, shared, personal-story, Archive}
    Bin/
    Logs/
    ONETHING_NORTHSTAR.md
```

### Step 4 — Context Extractor Starts
A lightweight Node.js Docker container starts watching all your `Raw/` folders simultaneously.

**What it does automatically, within 2 seconds of any file change:**
1. **Classifies** the content and routes to the appropriate Distilled/ subdirectory
2. **Distills** summaries for Clark and AIOO consumption
3. **Logs** every action to the entity's log directory

---

## After Setup: Core Workflows

### Drop a note
```bash
echo "# Q1 goal" > memory-vault/onething/Raw/michal/Submissions/2026-03-02.md
# → classified + distilled automatically within 2s
```

### Edit your Northstar
```bash
nano memory-vault/onething/ONETHING_NORTHSTAR.md
```
This is the locked constitution for the entity. All agents scoped to the entity will read it.

### Check Context Extractor logs
```bash
# Per-entity log
cat memory-vault/onething/Logs/context-extractor.log

# Live tail
docker compose --profile seed logs -f context-extractor
```

### Add a new entity later
```bash
./setup/add-entity.sh
```

### Add a human to an entity
```bash
./setup/add-human.sh
```

---

## Access Control Matrix

| Agent | Vault access | Mode |
|-------|-------------|------|
| `clark-{owner}` | All entities → `Distilled/Clark/` | read-only |
| `clark-{cofounder}` | Their entity → `Distilled/Clark/` | read-only |
| `aioo-{entity}` | Their entity → full vault | read-write |
| Context Extractor | All entities | read-write |

**Rule**: Clarks never see raw notes. They only see what Context Extractor has distilled for them. AIOOs see everything in their entity vault.

---

## File Privacy

These are gitignored and never committed:
- `memory-vault/` — all your notes, archives, distilled content
- `config.json` — your name, entity names, co-founder names
- `instances/` — spawned container instances

Everything in the repo is generic infrastructure — safe to push publicly.

---

## Repository Structure

```
clark/clark.sh              — spawn your Clark
aioo/aioo.sh <entity>       — spawn an entity AIOO
setup/install.sh             — first-time setup
setup/verify.sh              — system health check
setup/add-entity.sh          — add a new entity
setup/add-human.sh           — add a human to an entity
context-extractor/           — file watcher + distiller service
```

---

## Scaling to VPS

```bash
# On Mac — copy vault to VPS
scp -r ~/personal-ai/memory-vault user@vps:~/personal-ai/
scp ~/personal-ai/config.json user@vps:~/personal-ai/

# On VPS — identical command
cd ~/personal-ai && ./setup/install.sh
```

Zero code changes required. Docker Compose handles the rest.

---

## Mission Alignment
Setup is the gateway to "Do One Thing." A clean install means agents start focused from minute one. Every step — identity, entities, vault, agents — narrows scope toward the One Thing.

## Scope
First-time setup and ongoing administration. Does NOT define agent behavior (see agent CLAUDE.md files) or vault structure (see MEMORY_VAULT.md).

## Interfaces
- **Read by**: Humans setting up Personal AI
- **Written by**: Human (system architect)
- **Depends on**: setup/ scripts, Docker, config.json

## Outcomes
- Working Personal AI instance in under 10 minutes
- Every entity has vault, northstar, and scoped agents
- Context Extractor running and processing immediately

## Gamification Hooks
- [ ] Setup completion speed: time from first command to working system → onboarding efficiency
- [ ] First-note-to-distill time: seconds from dropping a note to seeing it in Distilled/ → pipeline latency
- [ ] Entity completeness: % of entities with all required directories and northstar → coverage score
- [ ] Human engagement: number of humans added per entity → team adoption signal

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial setup guide | System |
| 2026-03-04 | v0.4: Added constitution pattern, gamification hooks | System |
