# Personal AI v0.2 — Setup Guide

> Do One Thing. Earn Full Autonomy.

## What This Creates

Running `./install.sh` builds your **Personal AI workspace** from scratch — a private, Docker-native Founder OS with isolated memory per company, AI agents scoped to each project, and a Content Loader that watches everything you write and turns it into structured context for your agents.

---

## Prerequisites

- **Docker Desktop** running on your Mac (or Docker + Docker Compose on VPS)
- **bash** (pre-installed on Mac)
- No other dependencies. No database setup. No API keys at install time.

---

## Step-by-Step: What Happens During `./install.sh`

### Step 1 — Your Identity
You enter your first name. This creates **your Clark** (`clark-{name}`).

**Clark** is your Clarity Architect — a read-only agent that reads distilled summaries across all your company vaults and helps you stay focused on the One Thing that matters most. Your Clark has visibility into every company you own. Co-founders' Clarks are scoped to their company only.

### Step 2 — Your Companies
You add one company at a time. For each company you specify:
- **Name** — becomes the vault folder name and container prefix (e.g. `procenteo` → `aioo-procenteo`)
- **Solo or co-founder** — if co-founder, you enter their name, which creates a scoped `clark-{cofounder}` for them

For each company, this registers:
- An **AIOO** (`aioo-{company}`) — your AI Operating Officer. Full read/write access to that company's vault. Maintains the project northstar and spawns MVP builders.
- A **co-founder Clark** (if applicable) — read-only access to that company's `Distilled/Clark/` only.

### Step 3 — Vault & Config Created
Two things are generated:

**`config.json`** (private, gitignored) — the source of truth for your entire setup:
```json
{
  "owner": "michal",
  "clarks": [ { "name": "clark-michal", "projects": ["onething", "procenteo", "inisio"] }, ... ],
  "projects": [ { "name": "onething", "aioo": "aioo-onething", ... }, ... ]
}
```

**`chronicle-vault/`** (gitignored) — your private memory layer:
```
chronicle-vault/
  onething/
    Raw/
      Daily/          ← drop your daily notes here
      MVPs/           ← notes per MVP/subproject
      People/         ← notes about people
    Distilled/
      Clark/          ← Content Loader writes summaries here for Clark
      AIOO/           ← Content Loader writes summaries here for AIOO
    Archive/Raw/      ← every note version kept forever (never deleted)
    Logs/             ← onething-specific activity log
    ONETHING_NORTHSTAR.md  ← your long-term vision for this company
  procenteo/          ← same structure
  inisio/             ← same structure
  Logs/               ← system-wide Content Loader log
```

### Step 4 — Content Loader Starts
A lightweight Node.js Docker container starts watching all your `Raw/` folders simultaneously.

**What it does automatically, within 2 seconds of any file change:**
1. **Archives** the raw file to `Archive/Raw/YYYY-MM-DD-HH/` — immutable, never deleted
2. **Distills** a stub to `Distilled/Clark/` — what Clark can read
3. **Distills** a stub to `Distilled/AIOO/` — what AIOO can read
4. **Logs** every action to both the company log and the global system log

Isolation is enforced: the onething watcher only touches `onething/`, procenteo only touches `procenteo/`, etc.

---

## After Setup: Core Workflows

### Drop a note
```bash
echo "# Q1 goal" > chronicle-vault/procenteo/Raw/Daily/2026-03-02.md
# → archived + distilled automatically within 2s
```

### Edit your Northstar
```bash
nano chronicle-vault/onething/ONETHING_NORTHSTAR.md
```
This is the locked constitution for the company. Every MVP builder spawned for onething will read it.

### Spawn an MVP builder
```bash
./mvp-builder.sh onething plusone
```
Creates a Docker container (`mvp-onething-plusone`) with:
- Read-only mount of `onething/Distilled/` — sees Clark + AIOO summaries, nothing else
- `CLAUDE.md` pre-loaded with the company Northstar
- Log output to `onething/Logs/`

Attach to it: `docker exec -it mvp-onething-plusone sh`
Stop it: `docker stop mvp-onething-plusone && docker rm mvp-onething-plusone`

### Check Content Loader logs
```bash
# Global system log
cat chronicle-vault/Logs/content-loader.log

# Per-company log
cat chronicle-vault/onething/Logs/content-loader.log

# Live tail
docker compose --profile seed logs -f content-loader
```

### Add a new company later
```bash
./add-company.sh   # coming in next release
```

---

## Access Control Matrix

| Agent | Vault access | Mode |
|-------|-------------|------|
| `clark-michal` | All companies → `Distilled/Clark/` | read-only |
| `clark-{cofounder}` | Their company → `Distilled/Clark/` | read-only |
| `aioo-{company}` | Their company → full vault | read-write |
| `mvp-{company}-{name}` | Their company → `Distilled/` | read-only |
| Content Loader | All companies | read-write |

**Rule**: Clarks never see raw notes. They only see what Content Loader has distilled for them. AIOs see everything in their company vault. MVP builders see only distilled context — never raw.

---

## File Privacy

These are gitignored and never committed:
- `chronicle-vault/` — all your notes, archives, distilled content
- `config.json` — your name, company names, co-founder names
- `instances/` — spawned MVP builder instances

Everything in the repo is generic infrastructure — safe to push publicly.

---

## Scaling to VPS

```bash
# On Mac — copy vault to VPS
scp -r ~/personal-ai/chronicle-vault user@vps:~/personal-ai/
scp ~/personal-ai/config.json user@vps:~/personal-ai/

# On VPS — identical command
cd ~/personal-ai && ./install.sh
```

Zero code changes required. Docker Compose handles the rest.
