# Telegram Integration — Architectural Decisions

> Decisions made during Telegram integration spec-engineering. Each decision
> captures the options considered, the choice made, and the rationale.
> Date: 2026-03-14

## Decision TG1: Integration Approach

**Question:** How do 6 Telegram bots fit into NanoClaw-PAW's architecture?

**Answer: Option C — PAW-level bot management.** All 6 bots managed in
`src/paw/telegram-bots.ts`, bypassing upstream NanoClaw's channel system entirely.

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Extend channel registry | Multi-instance per channel type | Still routes through upstream container runner — wrong handler for Clark/AIOO |
| B. Multi-bot single channel | One Channel object managing 6 bots | Upstream message loop doesn't support per-bot handler routing |
| C. PAW-level bot management | All bots in `src/paw/`, bypass upstream channels | Larger PAW footprint, but zero upstream changes |
| D. Hybrid — one upstream bot + PAW routing | Single "router bot" via upstream, others outbound-only | Breaks "each Clark has own bot" requirement |

### Why Option C

1. PAW already bypasses upstream for Clark (own spawn path) and AIOO (own IPC path)
2. 6 bots × 3 different handlers (Clark, AIOO, Unares) don't fit upstream's
   single-bot → `runContainerAgent()` model
3. Zero upstream file changes — all Telegram logic lives in `src/paw/`
4. The 3 PAW touchpoints in `src/index.ts` (import, initPaw, shutdownPaw)
   are already the extension point
5. Consistent with PAW's role as the workspace-specific extension layer

### Upstream Divergence Risk

By not using the upstream Telegram channel, we miss upstream improvements. However:
- Upstream channel is a simple grammY wrapper — unlikely to change significantly
- Our multi-bot, multi-handler needs are fundamentally different
- PAW is already a fork extension — this is architecturally consistent

### What This Changes

- New file: `src/paw/telegram-bots.ts` (bot lifecycle, message routing)
- Modified: `src/paw/index.ts` (init/shutdown wiring)
- Modified: `src/paw/config.ts` (routing type extension)
- No upstream file changes

## Decision TG2: Bot Library

**Question:** Which Node.js Telegram Bot API library?

**Answer: grammY.**

| Library | TypeScript | Maintained | Multi-bot | Auto-retry |
|---------|-----------|-----------|-----------|------------|
| grammY | Native | Active (11d ago) | Natural | Official plugin |
| Telegraf | Migrated v4 | Stale (2yr) | Yes | Manual |
| node-telegram-bot-api | None | Slow (3mo) | Manual | Manual |

grammY was built by a former Telegraf contributor who fixed Telegraf's problems.
Upstream NanoClaw also uses grammY. Install: `npm install grammy @grammyjs/auto-retry`.

## Decision TG3: Polling vs Webhooks

**Question:** Long polling or webhooks for receiving Telegram updates?

**Answer: Long polling (Phase 1).**

- No public URL needed (MacBook Air dev, behind NAT)
- 6 concurrent HTTP connections are trivial for Node.js
- grammY handles polling automatically via `bot.start()`
- Reconsider webhooks on VPS if traffic warrants it

## Decision TG4: AIOO Group Bot Privacy Mode

**Question:** How does the AIOO bot see `@aioo` mentions in group chat?

**Answer: Privacy mode DISABLED + code-level @mention filtering.**

Privacy mode (enabled by default) filters `/commands`, NOT `@mentions` in regular
text. To see `@aioo` in regular messages, privacy mode must be disabled via
BotFather (`/setprivacy → DISABLE`). NanoClaw-PAW then filters for `@aioo`
mentions in `message.text` before processing.

Important: after changing privacy mode, the bot must be removed and re-added
to the group for the change to take effect.

### What This Changes

- BotFather setup: `/setprivacy → DISABLE` for AIOO bots only
- Code: `@aioo` mention check in telegram-bots.ts message handler

## Decision TG5: User Allowlisting

**Question:** How do we restrict bots to authorized users only?

**Answer: Numeric `user.id` in routing config.**

Telegram has no built-in user restriction. Application-level allowlisting using
`user.id` (numeric, stable, never changes). `user.username` can change — never
use for auth. User IDs stored as env var references in routing config.

## Decision TG6: Configuration Model

**Question:** Where do bot tokens, allowlists, and chat settings live?

**Answer: Option A — Extend routing.json with `telegram` fields.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Extend routing.json | Add `telegram` object to each route | Unified — one place for route → target → channel mapping |
| B. Separate telegram.json | Own config file in nanoclaw-config/ | Decoupled but splits routing truth across files |
| C. Env vars only | All config in env vars | No structured config, hard to see relationships |

### Why Option A

routing.json is already the single source of truth for route → target mapping.
Adding `telegram` fields keeps it unified — one place to see "this route uses
this bot, allows these users, triggers on @aioo."

### Extended Schema

```json
{
  "routes": {
    "clark-michal": {
      "target": "clark",
      "entity": ["ai-workspace", "procenteo", "inisio"],
      "human": "michal",
      "telegram": {
        "botTokenEnv": "TELEGRAM_CLARK_MICHAL_TOKEN",
        "mode": "dm",
        "allowedUsers": ["ENV:TELEGRAM_USER_MICHAL"]
      }
    },
    "aioo-procenteo": {
      "target": "aioo",
      "entity": "procenteo",
      "human": "michal",
      "telegram": {
        "botTokenEnv": "TELEGRAM_AIOO_PROCENTEO_TOKEN",
        "mode": "group",
        "trigger": "@aioo",
        "allowedUsers": ["ENV:TELEGRAM_USER_MICHAL", "ENV:TELEGRAM_USER_MATEUSZ"]
      }
    },
    "unares": {
      "target": "unares",
      "entity": ["ai-workspace", "procenteo", "inisio"],
      "human": "michal",
      "telegram": {
        "botTokenEnv": "TELEGRAM_UNARES_TOKEN",
        "mode": "dm",
        "allowedUsers": ["ENV:TELEGRAM_USER_MICHAL"]
      }
    }
  }
}
```

### What This Changes

- `nanoclaw-config/routing.json` → extended schema
- `src/paw/config.ts` → `PawRoutingEntry` type extended with `telegram?` field
- New env vars in `.env`: 6 bot tokens + 3 user IDs

## Decision TG7: Clark Message Delivery Path

**Question:** How do Telegram messages reach Clark and how do responses come back?

**Answer: Option A — `docker exec` Claude CLI.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. `docker exec` Claude CLI | PAW runs `docker exec clark-{human} claude --message "text"`, captures stdout | Natural for CLI container, no IPC needed |
| B. IPC filesystem | Write message JSON to shared dir, Clark reads + responds | Requires adding IPC to air-gapped Clark |

### Why Option A

Clark is a Claude Code CLI container. `docker exec` is the natural interaction
pattern — same as how agent-spawn-handler works for stage containers. No need to
add IPC infrastructure to an air-gapped container. Simpler.

### Message Flow

```
Telegram DM → grammY bot handler
  → PAW telegram-bots.ts
    → getOrSpawnClark(human, route, workspaceRoot)
    → docker exec clark-{human}-{ts} claude --message "{text}"
      ↓
    stdout captured by PAW
      ↓
    → bot.api.sendMessage(chatId, response)
      → Telegram DM reply
```

### What This Changes

- `src/paw/telegram-bots.ts` → Clark message handler calls docker exec
- `src/paw/clark-handler.ts` → may need `sendToClark(containerName, message)` helper

## Decision TG8: Conversation Logging

**Question:** Where are Telegram conversations logged?

**Answer: Option A — Vault `Logs/telegram/`.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Vault Logs/ | `memory-vault/{entity}/Logs/telegram/{bot}/YYYY-MM-DD.md` | Human-readable, Obsidian-friendly, Chronicle-indexable |
| B. NanoClaw SQLite | Upstream message storage DB | Couples to upstream schema, not vault-native |

### Why Option A

Vault is our knowledge layer. Markdown is human-readable + indexable by Chronicle.
Daily files prevent single-file bloat. One directory per bot for clean separation.

### Directory Structure

```
memory-vault/{entity}/Logs/telegram/
├── clark-michal/
│   └── 2026-03-14.md
├── aioo-procenteo/
│   └── 2026-03-14.md
└── unares/
    └── 2026-03-14.md
```

Entity mapping: Clark bots log to the entity they're scoped to (clark-michal
with multi-entity access logs to ai-workspace). AIOO bots log to their entity.

### Log Entry Format

```markdown
## 14:32:15 — michal
What's the status of procenteo app demo?

## 14:32:47 — aioo-procenteo
Stage 1 (Demo) is active. 3/5 tasks completed...
```

### What This Changes

- `src/paw/telegram-bots.ts` → log function that appends to daily .md file
- `memory-vault/{entity}/Logs/telegram/` directories created at init

## Decision TG9: Build Scope

**Question:** What's full, stub, or deferred?

| Feature | Scope | Notes |
|---------|-------|-------|
| 6 grammY Bot instances + long polling | full | Core |
| User allowlisting (numeric user.id) | full | Security gate |
| DM bots (Clark × 3, Unares × 1) | full | Primary path |
| Group bots (AIOO × 2) with @aioo trigger | full | Entity activation |
| `human-reply` IPC handler (AIOO → TG) | full | Enables AIOO responses |
| Clark `docker exec` message delivery | full | Enables Clark conversations |
| Conversation logging to vault Logs/ | full | Observability |
| Inline keyboards (Micro-HITL buttons) | full | UX for confirmations |
| Unares message handling | stub | Agent not built — log + acknowledge |
| Voice message transcription | deferred | Separate skill, add after core works |
| Image/document handling | deferred | Lower priority than text |
| Bot command menus (/start, /help) | stub | Basic /start response |

## References

- Telegram integration spec: `./telegram-integration.md`
- NanoClaw-PAW spec: `../Built/nanoclaw-paw.md`
- IPC protocol spec: `../Built/ipc-protocol.md`
- Clark spec: `../Built/clark.md`
- AIOO spec: `../Built/aioo.md`
- Research: `memory-vault/ai-workspace/Research/nanoclaw-telegram-integration-analysis.md`
- Research: `memory-vault/ai-workspace/Research/telegram-bot-api-analysis.md`
