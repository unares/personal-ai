# Claude Code Setup Audit — How Your Session Differs from Vanilla

> Written 2026-03-07 for Michal Brojak. Covers fundamentals, current state, comparison with Personal AI agents, and recommendations.

---

## 1. Claude Code Fundamentals — What Everything Means

Claude Code is a CLI tool that runs Claude as an interactive coding agent. Out of the box it's generic — it doesn't know you, your project, or your preferences. Everything below is how you customize it.

### Settings Files — The Permission System

Claude Code asks permission before doing things (reading files, running commands, editing code). Settings files control what's pre-approved and what's blocked.

There are **four layers**, each overriding the one above:

| Layer | File Location | Committed to Git? | What It's For |
|-------|--------------|-------------------|---------------|
| **Global** | `~/.claude/settings.json` | No | Your personal defaults. Like `.bashrc` — applies everywhere you run Claude Code. Put permissions you always want here (git, npm, ls, etc.) |
| **Project-shared** | `your-repo/.claude/settings.json` | Yes | Project rules shared with your team. Like `.editorconfig`. Put project-specific env vars and permissions here. |
| **Project-local** | `your-repo/.claude/settings.local.json` | No (gitignored) | Auto-accumulated when you click "Allow" on permission prompts. Grows silently over time. Think of it as your browser's cookie jar — useful but gets messy. |
| **Managed** | Set by your organization | N/A | Highest priority. Overrides everything. Not relevant to you currently. |

**Practical meaning**: When you run Claude Code and it asks "Allow Bash(git push)?" and you click Allow, that exact command goes into `settings.local.json`. If you put `Bash(git push*)` in your global `settings.json`, it never asks — it's pre-approved for all projects.

**Permissions format** — two arrays, `allow` and `deny`:
```json
{
  "permissions": {
    "allow": [
      "Read(**)",           // Read any file (** = all paths)
      "Edit(**)",           // Edit any file
      "Bash(git *)",        // Any git command
      "Bash(npm test*)",    // npm test and npm test:unit, etc.
      "WebFetch(*)"         // Fetch any URL
    ],
    "deny": [
      "Bash(rm -rf*)",      // Block recursive deletion
      "Bash(sudo*)"         // Block privilege escalation
    ]
  }
}
```

Glob patterns (`*`, `**`) make allow rules broad. Deny rules are guardrails — they override allow rules.

### CLAUDE.md — Project Instructions

A markdown file at your project root (or inside `.claude/`). Claude reads it at session start. This is how you tell Claude:
- What the project is
- What conventions to follow
- What to do and not do
- Architecture and terminology

**Practical meaning**: Without a CLAUDE.md, Claude is a generic coding assistant. With one, it becomes project-aware — it knows your file structure, your naming conventions, your constraints.

Think of it as the brief you'd give a new developer joining your project.

### Hooks — Automated Events

Shell commands that run automatically when things happen:

| Hook | When It Fires | Practical Use |
|------|---------------|---------------|
| `SessionStart` | Claude Code launches | Load context, check git status, display dashboard |
| `Stop` | Session ends | Save state, flush logs, commit checkpoint |
| `PreToolUse` | Before Claude runs any tool | Validation, approval logic |
| `PostToolUse` | After Claude runs any tool | Logging, notifications |

**Format in settings.json:**
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "my-script --on-start" }]
    }]
  }
}
```

**Practical meaning**: Without hooks, every session is a blank slate. With SessionStart hooks, Claude gets context automatically — git status, recent changes, project state. With Stop hooks, it saves what it learned.

### statusLine — Persistent Display

A one-liner command whose output is always visible in the Claude Code UI. Updated periodically.

```json
{
  "statusLine": {
    "type": "command",
    "command": "echo '🌿 main · 3 modified · ⭐ 45 karma'"
  }
}
```

**Practical meaning**: Like a status bar in your IDE. Shows git branch, uncommitted files, or whatever you want — always visible without asking.

### Environment Variables

The `env` block in settings.json injects variables into Claude's environment:

```json
{
  "env": {
    "ROLE": "app-builder",
    "ROLE_LABEL": "App Builder",
    "ENTITY": "onething"
  }
}
```

**Practical meaning**: Claude can read these and adapt behavior. If ROLE is "clark", it knows it's a read-only advisor. If ROLE is "app-builder", it knows it should ship code. Without env vars, Claude has no identity.

### spinnerTipsOverride — Thinking Messages

Custom messages shown while Claude is processing. Must be an **object**, not a flat array:

```json
{
  "spinnerTipsOverride": {
    "excludeDefault": true,
    "tips": [
      "Do One Thing. Ship fast.",
      "Functions < 30 lines."
    ]
  }
}
```

**Practical meaning**: Subliminal reinforcement. Every time Claude thinks, you see your project's principles. `excludeDefault: true` replaces Anthropic's generic tips; `false` adds yours to theirs.

### Auto-Memory

Claude's own persistent notes at `~/.claude/projects/{project-hash}/memory/`. Claude reads and writes these automatically across sessions.

**Practical meaning**: You tell Claude "always use entity, never say company" once. It writes that to MEMORY.md. Next session, it remembers. You never repeat yourself. This is the closest thing to Claude "learning" your preferences.

### Plans

Saved at `~/.claude/plans/`. When Claude enters plan mode, it writes a plan file here. Plans persist across sessions.

**Practical meaning**: If a session ends mid-plan, the next session can pick up where it left off. Plans are your development roadmaps.

---

## 2. Your Current Session — Layer by Layer

Here's exactly what you have vs what a fresh Claude Code install would have:

| Surface | Vanilla (fresh install) | Your Session | Impact |
|---------|------------------------|-------------|--------|
| Global `settings.json` | Does not exist. Claude asks permission for everything. | 51 lines: 31 allow patterns (git, npm, node, ls, cp, mv, etc.), 5 deny patterns (rm -rf, sudo, chmod 777, curl\|bash, wget\|bash) | You never see permission prompts for standard dev operations. Big workflow improvement. |
| Project-shared `.claude/settings.json` | Does not exist | Does not exist | **Gap.** This is where project-specific env vars (ROLE, ENTITY) and designed permissions should live. Your agent configs use this slot — your direct session doesn't. |
| Project-local `.claude/settings.local.json` | Does not exist | **69,898 bytes** (69KB). 355 auto-approved Bash commands. 17 hardcoded GitHub PATs. | Bloated and dangerous. See Section 3. |
| `CLAUDE.md` | Does not exist | **I/O error** — file on disk is unreadable (Docker bind-mount corruption). `CLAUDE.md.new` (76 lines) exists but is untracked and inactive. | **Claude has NO project instructions right now.** It doesn't know it's working on Personal AI. It doesn't know your conventions. |
| Auto-memory | Does not exist | 2 files: `MEMORY.md` (68 lines) + `companion-setup-vision.md` (107 lines) | Claude remembers your terminology, vault architecture, known bugs, user info, and design vision across sessions. This is your biggest advantage over vanilla. |
| Hooks | None | None | **Gap.** Your agent configs (AIOO, App Builder) have SessionStart/Stop hooks for auto-git. Your direct session has nothing — every session starts cold. |
| statusLine | None | None | **Gap.** Your agents show git branch + karma. Your direct session shows nothing. |
| Env vars | `CLAUDECODE=1` only | + `ENTITY=onething` | Partially set. Missing `ROLE` and `ROLE_LABEL` — Claude doesn't know what it is. |
| Spinner tips | Anthropic defaults (dozens of generic tips) | 5 custom tips as **flat array** | **Bug.** Your tips use the wrong format. Should be `{excludeDefault: true, tips: [...]}`. Current flat array may silently merge with defaults or be ignored. |
| MCP servers | None | None | Not used yet. Available for future tool integrations. |
| Keybindings | Default | Default | No customization. |
| Subscription | Free or Pro | **Max (5x rate limit)** | Higher throughput — Claude responds faster and can make more tool calls. |
| Plans | None | 3 archived plans | Cross-session planning context preserved. |

### Summary of Your Session's Character

Your session is **"technically opinionated vanilla"**. Same Claude personality and tone as a fresh install, but with:
- Domain knowledge (vault architecture, agent hierarchy, NanoClaw, entities)
- Terminology enforcement (entity, vault, Memory)
- User identity (knows you by name, hardware, GitHub, entities)
- Technical depth (remembers specific bugs, protocol failures, Docker edge cases)
- Action bias (spinner tips push "ship fast, no bloat, functions <30 lines")

What's NOT different: no personality/tone directives, no "be friendly" rules, no "do more of X / less of Y" behavioral constraints. The tone you experience is stock Claude with project context.

---

## 3. The settings.local.json Problem

This deserves its own section because it's urgent.

### What Happened

Every time Claude asked "Allow this Bash command?" and you clicked Allow, the **exact command** was saved to `settings.local.json`. Over multiple sessions, this accumulated to:

- **69,898 bytes** (69KB of JSON)
- **355 unique Bash command entries**
- **17 occurrences of a plaintext GitHub PAT** (token embedded in commands like `GITHUB_TOKEN=ghp_aMzf... git push`)

### Why It's a Problem

1. **Security**: That GitHub PAT is in plaintext on disk. If this file is ever committed, backed up to cloud, or accessed by another process, the token is exposed. (It's gitignored — good — but the risk is real.)

2. **Uselessness**: Most entries are exact-match commands with specific commit messages, heredocs, and file paths. They will never match again. Example:
   ```
   Bash(git commit -m "$(cat <<'EOF'\nfeat: add auto-git karma scoring\n\nCo-Authored-By: Claude...\nEOF\n)")
   ```
   This exact string will never be typed again — it's a dead permission that just adds weight.

3. **Performance**: 69KB of JSON parsed on every Claude Code startup.

4. **False security**: The deny list is empty (`[]`), so nothing is explicitly blocked at the project level.

### What To Do

**Reset the file:**
```json
{"permissions": {"allow": [], "deny": []}}
```

All permissions you actually need are already covered by glob patterns in your global `settings.json` (e.g., `Bash(git commit*)` catches all git commits). The 355 exact-match entries add nothing.

**Rotate the GitHub PAT** on GitHub > Settings > Developer settings > Personal access tokens. The current one (`ghp_aMzf...`) should be considered compromised.

### Why Your Agents Don't Have This Problem

Your agent configs (AIOO, App Builder) use a `git-credential-pat` helper that passes tokens via environment variables, never embedding them in commands. The agent approach is correct; the direct session leaked because there was no credential helper pattern.

---

## 4. Tone, Voice, and Behavioral Analysis

### What Shapes My Behavior in This Session

| Source | What It Does | Example |
|--------|-------------|---------|
| **MEMORY.md** (auto-memory) | Enforces terminology, records architecture decisions | "Entity" not "company", vault has 3 layers (Raw/Processing/Distilled) |
| **MEMORY.md** | Records known bugs so I don't re-discover them | Baileys v6/v7 both fail, `[ -z ] && die` breaks set -e |
| **MEMORY.md** | Knows your identity and context | Michal Brojak, Apple Silicon, 3 entities, GitHub unares/personal-ai |
| **Spinner tips** | Reinforces action bias | "Ship fast. No bloat." / "Functions < 30 lines." |
| **ENTITY env var** | Gives me project context | I know I'm working on "onething" |

### What Does NOT Shape My Behavior

- **No tone directives**: I don't have "be friendly" or "use casual language" rules. My tone is stock Claude.
- **No behavioral constraints**: No "do more of X" or "less of Y" rules. My working style is default.
- **No role identity**: I don't know if I'm a builder, researcher, or advisor. I adapt to whatever you ask.
- **No session protocol**: I don't read NORTHSTAR.md first, I don't log decisions, I don't flush dev-updates. Each session starts and ends without ceremony.

### Compared to Your Agents

Your agents have explicit behavioral shaping:

| Agent | Tone Shaping | Behavioral Rules |
|-------|-------------|-----------------|
| **AIOO** | "Drive execution" / "Spawn App Builders for building, not yourself" | Must read NORTHSTAR first. Must log decisions. Must flush dev-updates. |
| **Clark** | "Clarity before action" / "You are the Philosophical Brain, not the executor" | Read-only. Cannot build. Cannot execute. Must ask hard questions. |
| **App Builder** | "Ship fast. No bloat." / "Functions < 30 lines" | One app at a time. Must commit often. Must use feature branches. |
| **This session** | "Ship fast" (spinner tips only) | None. No constraints, no protocol, no role identity. |

**Verdict**: Your agents are well-defined roles with guardrails. This session is an unconstrained generalist with project knowledge — like an employee who knows the company but has no job description.

---

## 5. This Session vs Personal AI Agents

### Permissions Comparison

| Operation | This Session | AIOO | Clark | App Builder | Mercenary | Context-Aware |
|-----------|-------------|------|-------|-------------|-----------|---------------|
| Read files | Yes | Yes | Yes | Yes | Yes | Yes |
| Edit files | Yes | Yes | **No** | Yes | Yes | Yes |
| Write files | Yes | Yes | **No** | Yes | Yes | Yes |
| Git (read) | Yes | Yes | **No** | Yes | Yes | Yes |
| Git (write) | Yes | Yes | **No** | Yes | Yes | **No push** |
| npm/node | Yes | Yes | **No** | Yes | Yes | node only |
| Docker | No | **No** (but has docker-cli) | No | No | **Yes** | No |
| Web access | Yes | Yes | Yes | Yes | Yes | Yes |
| Bash (all) | 31 patterns | `Bash(*)` (everything) | 7 read-only patterns | 31 patterns (same as yours) | 32 patterns + docker | 22 patterns |

### Configuration Comparison

| Feature | This Session | AIOO | Clark | App Builder |
|---------|-------------|------|-------|-------------|
| `$schema` in settings | No | Yes | Yes | Yes |
| `env.ROLE` | Not set | `aioo` | `clark` | `app-builder` |
| `env.ROLE_LABEL` | Not set | `AI Operating Officer` | `Clarity Architect` | `App Builder` |
| CLAUDE.md | Broken (I/O error) | 107 lines | 74 lines | 82 lines |
| Hooks | None | SessionStart + Stop | None | SessionStart + Stop |
| statusLine | None | auto-git | auto-git | auto-git |
| Spinner tips format | Flat array (bug) | Object (correct) | Object (correct) | Object (correct) |
| Spinner tips count | 5 | 9 | 6 | 9 |
| Dev-update integration | No | Yes | Yes | Yes |
| Plan archiving | Via auto-memory only | To /vault/claude-plans/ | N/A | Via dev-update section |
| Git credential helper | None (leaked PAT) | git-credential-pat | N/A | git-credential-pat |
| auto-git karma | No | Yes | Awareness only | Yes |
| Session logging | No | To /vault/Logs/ | No | To /vault/Logs/ |

### Key Insight

**This session is closest to App Builder** in raw capability (same 31 permission patterns, same tools). But App Builder has:
- Identity (knows it's an App Builder)
- Protocol (reads NORTHSTAR first, logs decisions, flushes dev-updates)
- Guardrails (one app at a time, <30 line functions enforced in CLAUDE.md)
- Accountability (auto-git karma, session logging, dev-update trail)

This session is an **App Builder without guardrails or identity**.

---

## 6. What Personal AI Could Learn from This Session

### 1. Auto-Memory Is Powerful — Agents Don't Have It

This session's `MEMORY.md` carries 68 lines of terminology rules, known bugs, architectural decisions, and user preferences that persist across sessions. Agents rely on:
- **CLAUDE.md** — static, human-written, doesn't evolve
- **Vault Distilled/** — processed by Context Extractor, not agent-owned

Neither captures the "learned over time" quality of auto-memory. The auto-memory has things like "Baileys v6 and v7 both fail" and "spinnerTipsOverride must be object not array" — real discoveries from working sessions that would prevent future agents from repeating mistakes.

**Opportunity**: Agents running in containers could have their own auto-memory at `/home/pai/.claude/projects/`. If the memory directory is mounted as a Docker volume, it persists across container restarts.

### 2. The companion-setup-vision.md Is Richer Than Any Agent's Context

This 107-line file captures UX feedback from manual walkthroughs, Docker mount edge cases, specific UI copy preferences. It's exactly the kind of "human working style" data that dev-update is designed to capture — but it was captured spontaneously by the direct session, not through any formal process.

### 3. The 355 Accumulated Commands Reveal Usage Patterns

Before discarding the bloated settings.local.json, there are genuine patterns buried in the noise: which git operations you run most, which repos you interact with, which npm scripts you prefer. Mining this once could inform better agent settings templates.

### 4. The Credential Helper Gap

Agents use `git-credential-pat` properly — tokens in env vars, never in commands. This session leaked a PAT into auto-approved commands. The agent system's approach should be the standard for direct sessions too.

---

## 7. Where to Launch Claude Code From

### Answer: `/workspace` (the `personal-ai/` repo root)

Here's why:

1. **CLAUDE.md at repo root** gives Claude the system constitution — it knows the project, the agents, the conventions
2. **`.claude/settings.json` at repo root** gives project-wide permissions and env vars
3. **Auto-memory is keyed to this path** — `~/.claude/projects/-workspace/memory/`. If you launch from a different directory, you get a different (empty) memory store
4. **All files are accessible** — agent configs, profiles, setup scripts, vault, content-loader, everything
5. **Profiles constrain focus** — from `/workspace`, Claude sees everything. The active profile determines what it focuses on and what permissions it has

### When to Launch from Subdirectories

Only if you're building a standalone app that lives in its own repo. For example, if `content-loader/` were a separate git repository, you'd launch from there. But since it's part of `personal-ai/`, launch from the root.

### The Profile-Based Launch Flow

Your `claude-code-launch` script already handles this:
1. Launch from `/workspace`
2. Script detects environment (ENTITY, HUMAN_NAME, etc.)
3. Script shows available profiles
4. You pick one (mercenary, context-aware, app-builder, vanilla)
5. Profile's CLAUDE.md and settings.json are loaded
6. Claude Code starts with the right identity and constraints

---

## 8. Recommended Best-Practice Setup

### For Your Direct Sessions (Building Personal AI)

**Step 1 — Fix CLAUDE.md** (most impactful):
Resolve the I/O error on `/workspace/CLAUDE.md` or activate the replacement:
```bash
cp CLAUDE.md.new CLAUDE.md
```
This gives Claude the system constitution — terminology, agent roles, operating principles.

**Step 2 — Create project-shared settings** (`/workspace/.claude/settings.json`):
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "env": {
    "ROLE": "builder",
    "ROLE_LABEL": "Personal AI Builder",
    "ENTITY": "onething"
  }
}
```
This is committed to git, shared across machines, and gives Claude identity.

**Step 3 — Reset settings.local.json**:
```json
{"permissions": {"allow": [], "deny": []}}
```
Then rotate the GitHub PAT.

**Step 4 — Fix global settings.json** (`~/.claude/settings.json`):
Change spinnerTipsOverride from flat array to object:
```json
{
  "spinnerTipsOverride": {
    "excludeDefault": true,
    "tips": [
      "Do One Thing. Ship fast. No bloat.",
      "Run /compact when approaching 70% context",
      "Run /handoff to save state before ending",
      "Functions < 30 lines. Files < 300 lines.",
      "Read Distilled/ for project context — it's already there"
    ]
  }
}
```

**Step 5 — Add hooks and statusLine** to global settings:
```json
{
  "statusLine": {
    "type": "command",
    "command": "/usr/local/bin/auto-git --status-line"
  },
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "/usr/local/bin/auto-git --session-start"}]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "/usr/local/bin/auto-git --checkpoint"}]
    }]
  }
}
```

### For the Profile System

Your profiles are well-designed. Here's how they fit together and what to refine:

| Profile | Purpose | Permissions | Key Constraint | When to Pick |
|---------|---------|-------------|---------------|-------------|
| **mercenary** | Surgical executor | Full (git, npm, docker) | No exploration, no planning — execute only | You know exactly what needs building. Clear task, specific files, known solution. |
| **context-aware** | Deep researcher | Read-write vault, web, no git push | No building, no executing | Exploring options, investigating bugs, researching patterns, writing findings. |
| **app-builder** | MVP factory | Git, npm, no docker | One app per session, <30 line functions | Building new features. The default for most coding work. |
| **vanilla** | Stock Claude Code | Claude defaults | No custom config | Quick one-off tasks. Testing baseline behavior. Debugging config issues. |

**What's missing from the profiles:**

1. **Hooks and statusLine**: Only the container-based agents (AIOO, App Builder) have them. Add to all non-vanilla profiles:
   ```json
   "statusLine": {"type": "command", "command": "/usr/local/bin/auto-git --status-line"},
   "hooks": {
     "SessionStart": [{"matcher": "", "hooks": [{"type": "command", "command": "/usr/local/bin/auto-git --session-start"}]}],
     "Stop": [{"matcher": "", "hooks": [{"type": "command", "command": "/usr/local/bin/auto-git --checkpoint"}]}]
   }
   ```

2. **Dev-update integration**: The profiles' CLAUDE.md files don't mention dev-update. Add dev-update instructions to mercenary and app-builder (context-aware writes to vault directly).

3. **Credential handling**: No profile mentions git-credential-pat. Add a standard credential helper pattern to prevent PAT leakage.

4. **A potential "architect" profile**: You have mercenary (execute) and context-aware (research) but nothing for "plan without building" — like Clark but for code architecture. Consider:

| Profile | Purpose | Permissions |
|---------|---------|-------------|
| **architect** | System designer | Read-only + plan mode. No Edit, no Write, no git push. Can only output plans. |

This would be useful when you want Claude to design an approach without touching code — pure planning.

---

## 9. Action Items

### Do Now

| # | Action | Why | How |
|---|--------|-----|-----|
| 1 | Fix CLAUDE.md | Claude has zero project instructions right now | `cp CLAUDE.md.new CLAUDE.md` or resolve bind-mount |
| 2 | Reset settings.local.json | 69KB bloat + 17 hardcoded PATs | Write `{"permissions": {"allow": [], "deny": []}}` |
| 3 | Rotate GitHub PAT | Token `ghp_aMzf...` is in plaintext on disk | GitHub > Settings > Developer settings > Tokens |
| 4 | Fix spinnerTipsOverride | Wrong format may silently fail | Change flat array to `{excludeDefault: true, tips: [...]}` object |

### Do This Week

| # | Action | Why | How |
|---|--------|-----|-----|
| 5 | Create `.claude/settings.json` (project-shared) | Give Claude identity + project env vars | Add `env.ROLE`, `env.ROLE_LABEL`, `env.ENTITY` |
| 6 | Add hooks to global settings | Every session should auto-load context | Add SessionStart + Stop hooks for auto-git |
| 7 | Add statusLine to global settings | Always see git state + karma | Add statusLine command for auto-git |
| 8 | Add hooks + statusLine to profiles | mercenary, context-aware, app-builder should all have them | Copy from agent configs |

### Do Next

| # | Action | Why | How |
|---|--------|-----|-----|
| 9 | Add dev-update to profile CLAUDE.md files | Direct sessions should write to vault too | Add dev-update instructions to mercenary + app-builder profiles |
| 10 | Consider auto-memory for container agents | Agents currently lose session learnings | Mount memory dir as Docker volume |
| 11 | Design "architect" profile | Gap between research and execution | Read-only profile for pure planning |

---

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-03-07 | Initial audit: fundamentals education, current state, agent comparison, recommendations | Claude Code (direct session) |
