# Telegram Integration — Specification

> Component: telegram-integration
> Entity: ai-workspace (infrastructure, applies to all entities)
> Status: Planned
> Dependencies: NanoClaw-PAW (Built, Layer 4), Clark (Built, Layer 5),
>               AIOO (Built, Layer 3), Identity Loading (Planned)
> Decisions: `./telegram-integration-decisions.md`

## Problem Statement

NanoClaw-PAW has no messaging channel connected. The `human-reply` IPC handler is
a stub that logs and does nothing. Clark containers can be spawned but have no
message input/output path — there is no way for a human to send a Telegram message
and receive a Clark response. AIOO can write `human-reply` IPC envelopes but they
are silently dropped. The 6-bot Telegram architecture (3 Clark DMs, 2 AIOO groups,
1 Unares admin) requires PAW-level bot management because upstream NanoClaw's
channel system is a single-bot-per-channel model that cannot handle multiple bots
with different handler targets. Without this integration, entity activation
(procenteo and inisio AIOOs online, human-AI conversations via Micro-HITL) cannot
proceed.

## Acceptance Criteria

1. Six grammY Bot instances run in the NanoClaw-PAW process via long polling, each
   with independent user allowlisting (numeric `user.id`), and unauthorized messages
   are silently dropped with a log entry — no response sent to unauthorized users.

2. A human sending a Telegram DM to their Clark bot receives a Claude CLI response
   within the same chat, and a human sending `@aioo` in an entity group chat
   triggers an IPC message to the AIOO daemon whose `human-reply` response arrives
   back in the same Telegram group — both paths logged to daily markdown files in
   `memory-vault/{entity}/Logs/telegram/{bot}/YYYY-MM-DD.md`.

3. AIOO Micro-HITL confirmations render as inline keyboard buttons (e.g. "YES / NO")
   in Telegram, and callback query responses are routed back to the AIOO daemon via
   the same IPC `human-message` envelope type with the button payload.

## Constraint Architecture

### Must-Do

- All 6 bots managed in `src/paw/telegram-bots.ts` (PAW-level, Decision TG1)
- grammY library for all bot instances (Decision TG2)
- Long polling via `bot.start()` — no webhooks (Decision TG3)
- AIOO group bots: privacy mode disabled via BotFather, `@aioo` mention
  filtering in code (Decision TG4)
- User allowlisting via numeric `user.id` from routing config (Decision TG5)
- Bot tokens read from env vars referenced in routing.json `telegram.botTokenEnv`
  field (Decision TG6)
- Clark messages delivered via `docker exec` Claude CLI in running Clark container
  (Decision TG7)
- Conversations logged to vault `Logs/telegram/{bot}/YYYY-MM-DD.md` (Decision TG8)
- Inline keyboards for Micro-HITL confirmations (yes/no/options) (Decision TG9, full scope)
- `human-reply` IPC handler fully implemented — routes AIOO responses to correct
  Telegram bot and chat
- `human-message` IPC type used for Telegram → AIOO messages (existing type)
- Graceful shutdown: all 6 bots stopped on SIGINT/SIGTERM via PAW shutdown
- `@grammyjs/auto-retry` plugin on all bots for rate limit handling
- Message splitting for responses > 4096 characters (Telegram limit)
- Bot tokens in `.env` file (gitignored), never committed to git
- Unares route added to routing.json
- Functions < 30 lines, files < 300 lines

### Must-Not-Do

- Never use upstream NanoClaw channel system for these bots — PAW-level only
- Never expose bot tokens to containers (Clark, AIOO, stage containers)
- Never modify upstream NanoClaw source files (`src/index.ts`, `src/channels/`,
  `src/container-runner.ts`, etc.) — PAW extensions only
- Never respond to unauthorized users (no "access denied" message — silent drop)
- Never store bot tokens in routing.json directly — use env var references
- Never use `user.username` for allowlisting (can change — use `user.id` only)

### Preferences

- Prefer a bot factory function that takes a route config and returns a configured
  grammY Bot instance — reduces duplication across 6 bots
- Prefer `bot.catch()` per bot for error isolation — one bot's crash should not
  affect others
- Prefer logging unauthorized attempts at `warn` level with user info for
  security awareness
- Prefer ISO timestamps in conversation log entries
- Prefer `ParseMode` "Markdown" for bot responses where the source supports it

### Escalation Triggers

- If a bot token env var is missing at startup: log error, skip that bot, continue
  with remaining bots. Do not crash PAW.
- If all 6 bot tokens are missing: log fatal, PAW starts but with warning —
  messaging unavailable
- If `docker exec` to Clark fails: log error, send "Clark is unavailable" reply
  to Telegram, do not crash
- If AIOO IPC write fails: log error, send "AIOO is unavailable" reply to Telegram

## Data Residency

| Data Type | Host Path | Container Path | Mode | File Types |
|-----------|-----------|---------------|------|------------|
| Conversation logs | `memory-vault/{entity}/Logs/telegram/{bot}/` | `/vault/Logs/telegram/{bot}/` (AIOO only) | rw (AIOO) | .md daily files |
| Bot tokens | `.env` (gitignored) | N/A (host process only) | — | — |
| User IDs | `.env` (gitignored) | N/A (host process only) | — | — |
| Routing config | `nanoclaw-config/routing.json` | N/A (host process only) | — | .json |

Conversation logs are written by NanoClaw-PAW (host process) directly to the
vault filesystem. AIOO can read its entity's logs via existing vault mount.
Clark containers do not see conversation logs (air-gapped, Distilled/ only).

## Environment Variables

```bash
# Bot tokens (6 — one per bot, gitignored in .env)
TELEGRAM_CLARK_MICHAL_TOKEN=
TELEGRAM_CLARK_MATEUSZ_TOKEN=
TELEGRAM_CLARK_ANDRAS_TOKEN=
TELEGRAM_AIOO_PROCENTEO_TOKEN=
TELEGRAM_AIOO_INISIO_TOKEN=
TELEGRAM_UNARES_TOKEN=

# User IDs (3 — numeric Telegram user IDs, gitignored in .env)
TELEGRAM_USER_MICHAL=
TELEGRAM_USER_MATEUSZ=
TELEGRAM_USER_ANDRAS=
```

## Extended Routing Schema

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
    "clark-mateusz": {
      "target": "clark",
      "entity": "procenteo",
      "human": "mateusz",
      "telegram": {
        "botTokenEnv": "TELEGRAM_CLARK_MATEUSZ_TOKEN",
        "mode": "dm",
        "allowedUsers": ["ENV:TELEGRAM_USER_MATEUSZ"]
      }
    },
    "clark-andras": {
      "target": "clark",
      "entity": "inisio",
      "human": "andras",
      "telegram": {
        "botTokenEnv": "TELEGRAM_CLARK_ANDRAS_TOKEN",
        "mode": "dm",
        "allowedUsers": ["ENV:TELEGRAM_USER_ANDRAS"]
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
    "aioo-inisio": {
      "target": "aioo",
      "entity": "inisio",
      "human": "michal",
      "telegram": {
        "botTokenEnv": "TELEGRAM_AIOO_INISIO_TOKEN",
        "mode": "group",
        "trigger": "@aioo",
        "allowedUsers": ["ENV:TELEGRAM_USER_MICHAL", "ENV:TELEGRAM_USER_ANDRAS"]
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

### ENV: Prefix Resolution

Values prefixed with `ENV:` in routing.json (e.g., `"ENV:TELEGRAM_USER_MICHAL"`) are
resolved at startup by reading the corresponding environment variable
(`process.env.TELEGRAM_USER_MICHAL`). This resolution is implemented in
`src/paw/config.ts` during routing config loading. Unresolved `ENV:` references
log a warning and are skipped from allowlists.

## Message Flow Diagrams

### Clark DM Flow

```
Human (Telegram DM)
  → grammY bot[clark-{human}] receives update
    → allowlist check (user.id)
    → log message to vault Logs/telegram/clark-{human}/
    → getOrSpawnClark(human, route, workspaceRoot)
    → docker exec clark-{human}-{ts} claude --message "{text}"
      ↓ stdout captured
    → log response to vault
    → bot.api.sendMessage(chatId, response)
      → Human sees reply in Telegram DM
```

### AIOO Group Flow

```
Human (Telegram group, "@aioo do something")
  → grammY bot[aioo-{entity}] receives update
    → allowlist check (user.id)
    → @aioo mention check in message.text
    → log message to vault Logs/telegram/aioo-{entity}/
    → write IPC envelope to ipc/aioo-{entity}/from-paw/
      type: "human-message"
      payload: { text, human, chatId, messageId }
      ↓
    AIOO daemon picks up via IPC poller
      → brain processes → generates response
      → writes IPC envelope to ipc/aioo-{entity}/to-paw/
        type: "human-reply"
        payload: { text, chatId, inlineKeyboard? }
      ↓
    PAW human-reply handler picks up
      → find bot for aioo-{entity} route
      → bot.api.sendMessage(chatId, text, { reply_markup? })
        → Human sees reply in Telegram group
```

### Micro-HITL Inline Keyboard Flow

```
AIOO writes human-reply IPC with inline keyboard:
  payload: {
    text: "[procenteo] Stage 1 → Stage 2?",
    chatId: "tg:-1001234567890",
    inlineKeyboard: [
      [{ text: "YES", callback_data: "hitl:stage-transition:yes" }],
      [{ text: "NO", callback_data: "hitl:stage-transition:no" }]
    ]
  }
  ↓
PAW sends message with reply_markup: { inline_keyboard }
  ↓
Human taps "YES" button
  → grammY callback_query handler
    → log choice to vault
    → write IPC envelope to AIOO:
      type: "human-message"
      payload: { text: "yes", callbackData: "hitl:stage-transition:yes",
                 human, chatId, replyTo: originalMessageId }
    → bot.api.answerCallbackQuery() (removes loading spinner)
    → bot.api.editMessageReplyMarkup() (remove buttons after selection)
```

## IPC Schema Extension

This integration extends two existing IPC message types with channel-specific
routing fields. AIOO echoes routing fields from `human-message` back in
`human-reply` so PAW can route responses to the correct Telegram chat.

### human-message (PAW → AIOO) — extended payload

Built spec payload: `{ channel, human, text }`
Extended payload:   `{ channel, human, text, chatId, messageId }`

- `chatId` — Telegram chat ID (numeric string). AIOO passes through to reply.
- `messageId` — Telegram message ID. Used for inline keyboard `replyTo`.

### human-reply (AIOO → PAW) — extended payload

Built spec payload: `{ channel, text, hitlTier }`
Extended payload:   `{ channel, text, hitlTier, chatId, inlineKeyboard? }`

- `chatId` — echoed from incoming `human-message`. PAW uses to route reply.
- `inlineKeyboard` — optional array of button rows for Micro-HITL.

Propagation: update `Built/ipc-protocol.md` with extended payload schemas.

## Decomposition

| # | Subtask | Scope | Est | Notes |
|---|---------|-------|-----|-------|
| 1 | Install grammY + auto-retry plugin | full | 15min | `npm install grammy @grammyjs/auto-retry` in services/nanoclaw-paw/ |
| 2 | Extend `PawRoutingEntry` type with `telegram` field | full | 15min | `src/paw/config.ts` — add optional `telegram` object type |
| 3 | Update routing.json with 6-bot config (unares route added) | full | 15min | Extended schema, env var references for tokens and user IDs |
| 4 | Implement `telegram-bots.ts` — bot factory + lifecycle | full | 1.5h | Create bots from config, start/stop, error handlers, export bot map |
| 5 | Implement DM message handler (Clark path) | full | 1.5h | Allowlist → log → getOrSpawnClark → docker exec → capture stdout → reply |
| 6 | Implement group message handler (AIOO path) | full | 1h | Allowlist → @aioo check → log → IPC human-message → AIOO daemon |
| 7 | Implement `human-reply` IPC handler | full | 1h | Replace existing stub in PAW IPC poller handler. Read envelope → find bot → sendMessage. Support inline keyboards. |
| 8 | Implement inline keyboard support (Micro-HITL) | full | 1h | callback_query handler → IPC to AIOO. answerCallbackQuery + editMessageReplyMarkup. |
| 9 | Implement conversation logging | full | 45min | Append to daily .md files. Create dirs on init. ISO timestamps. |
| 10 | Implement Unares handler (stub) | stub | 30min | Log message + acknowledge ("Unares received your message"). Requires: Unares agent build. |
| 11 | Implement /start command (stub) | stub | 15min | Basic greeting response per bot type. Full menu deferred. |
| 12 | Wire init/shutdown into PAW lifecycle | full | 30min | `src/paw/index.ts` — start bots in initPaw, stop in shutdownPaw |
| 13 | Add .env.example with all token/ID placeholders | full | 15min | Document env vars, never commit actual .env |
| 14 | Write tests | full | 2h | Bot factory, allowlisting, message routing, IPC handler, logging, inline keyboards |

Prior-layer dependencies (already built):
- NanoClaw-PAW index.ts (Layer 4) — 3 PAW touchpoints, unchanged
- clark-handler.ts (Layer 4) — `getOrSpawnClark()`, may add `sendToClark()` helper
- ipc-handler.js (Layer 2) — `human-message` type exists, `human-reply` stub exists
- IPC library (Layer 0) — createEnvelope, writeMessage
- AIOO hitl-manager.js (Layer 3) — handles `human-message`, writes `human-reply`

## Evaluation Design

### Unit Tests (telegram-bots.ts)

| # | Test | Expected Result |
|---|------|----------------|
| T1 | Bot factory with valid config | Returns configured grammY Bot instance with auto-retry middleware |
| T2 | Bot factory with missing token env var | Returns null, logs error at warn level |
| T3 | Allowlist check — authorized user | Message processed (handler called) |
| T4 | Allowlist check — unauthorized user | Message silently dropped, warn-level log with user info |
| T5 | DM bot receives text message | Calls Clark docker exec handler |
| T6 | Group bot receives message without @aioo | Message ignored (not processed) |
| T7 | Group bot receives message with @aioo | Calls AIOO IPC handler |
| T8 | Message splitting for text > 4096 chars | Multiple sendMessage calls, each ≤ 4096 chars |

### Unit Tests (human-reply IPC handler)

| # | Test | Expected Result |
|---|------|----------------|
| T9 | Receive human-reply IPC with text | Sends message via correct bot to correct chatId |
| T10 | Receive human-reply IPC with inlineKeyboard | Sends message with reply_markup containing inline keyboard |
| T11 | Receive human-reply for unknown route | Logs error, does not crash |

### Unit Tests (inline keyboards)

| # | Test | Expected Result |
|---|------|----------------|
| T12 | Callback query received | Writes IPC human-message with callbackData to AIOO |
| T13 | Callback query answered | answerCallbackQuery called (removes loading spinner) |
| T14 | After callback, buttons removed | editMessageReplyMarkup called to clear buttons |

### Unit Tests (conversation logging)

| # | Test | Expected Result |
|---|------|----------------|
| T15 | Log inbound message | Appends to `{entity}/Logs/telegram/{bot}/YYYY-MM-DD.md` with ISO timestamp, sender, text |
| T16 | Log outbound response | Appends to same daily file with bot name as sender |
| T17 | Date rollover | New file created for new date |

### Integration Tests

| # | Test | Expected Result |
|---|------|----------------|
| T18 | PAW startup with 3/6 tokens configured | 3 bots start successfully, 3 skipped with warnings |
| T19 | PAW shutdown | All active bots stopped (no polling loops remain) |
| T20 | Clark DM end-to-end (mock docker exec) | Message in → Clark spawn → exec → response → reply sent |
| T21 | AIOO IPC round-trip (mock) | Message in → IPC written → human-reply IPC read → reply sent |
| T22 | Inline keyboard round-trip (mock) | Reply with buttons → callback → IPC → buttons removed |

## BotFather Setup Checklist (Manual, Pre-Build)

For each of the 6 bots, via @BotFather on Telegram:
1. `/newbot` — create and receive token
2. `/setdescription` — explain what this bot does
3. `/setabouttext` — short bio
4. `/setprivacy` — DISABLE for AIOO bots only (to see @aioo mentions)
5. `/setjoingroups` — DISABLE for DM-only bots (Clark, Unares)
6. Store token in `.env` on host machine
7. Create Telegram groups for procenteo and inisio, add AIOO bots
8. Collect 3 numeric user IDs (Michal, Mateusz, Andras) via @userinfobot

## References

- Decisions: `./telegram-integration-decisions.md`
- NanoClaw-PAW spec: `../Built/nanoclaw-paw.md`
- AIOO spec: `../Built/aioo.md`
- Clark spec: `../Built/clark.md`
- IPC protocol spec: `../Built/ipc-protocol.md`
- Identity loading spec: `./identity-loading.md`
- Research: `../../Research/nanoclaw-telegram-integration-analysis.md`
- Research: `../../Research/telegram-bot-api-analysis.md`
