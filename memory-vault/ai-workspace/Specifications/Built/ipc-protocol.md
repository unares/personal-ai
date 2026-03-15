# IPC Protocol — Specification

> The nervous system. Typed Envelope over filesystem.
> Date: 2026-03-12
> Origin: AIOO Decision A3 (`./aioo-decisions.md`)

## JTBD

"When any component needs to communicate with another, I want a single,
consistent protocol that works everywhere — containers to host, host to
containers, internal daemon calls — so that debugging is always the same
skill: ls, cat, jq."

## The 5 Primitives

### 1. Problem Statement

Personal AI Workspace has multiple components that need to communicate:
AIOO (container), NanoClaw-PAW (host), App Dev Stage containers, and
the Stage handler. These components run in different Docker contexts
(some in containers, one on host). Network-based IPC would require
port management and breaks container isolation patterns. Filesystem
IPC — shared directories with JSON files — is debuggable, auditable,
and works naturally with Docker volume mounts.

### 2. Acceptance Criteria

1. Any component can send a message to any other by writing a JSON file
   to the correct directory. The receiver processes it within 1 second.
2. Every message is traceable: given a message ID, you can follow the
   full conversation chain via `replyTo` fields using `jq`.
3. A human can debug any communication problem with three commands:
   `ls` (what's pending), `cat` (what does it say), `jq` (trace chain).
4. No message is ever lost — processed messages move to `processed/`,
   never deleted during normal operation.
5. Two components that don't share an IPC channel cannot communicate
   (channels enforce boundaries).

### 3. Constraint Architecture

**Must do:**
- One JSON file per message (atomic write — no partial reads)
- Typed Envelope format for all messages (no exceptions)
- Shared directory per channel (one writer side, one reader side)
- Processed messages moved to `processed/` (audit trail)
- Poll-based reading at 1s intervals

**Must not do:**
- Use network sockets between containers (filesystem only)
- Allow bidirectional writing to same directory (prevents race conditions)
- Delete messages during normal operation (audit requirement)
- Invent per-component message formats (one format everywhere)

**Preferences:**
- File naming: `msg-{uuid}.json` (sortable, unique, no collisions)
- Atomic write: write to `.tmp`, rename to `.json` (prevents partial reads)
- `processed/` cleanup: configurable retention (default: 7 days)

**Escalation triggers:**
- IPC directory fills up (reader not processing) → Health Monitor alert
- Message processing latency > 5s → investigate reader
- Orphaned messages (no reader for channel) → configuration error

### 4. Decomposition

#### The Typed Envelope

Every message in the system uses this format. No exceptions.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "spawn-agent",
  "from": "aioo-procenteo",
  "to": "nanoclaw-paw",
  "timestamp": "2026-03-12T14:30:00.000Z",
  "payload": {},
  "replyTo": null
}
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | UUID v4 | Yes | Unique message identifier |
| `type` | String | Yes | Message type (determines payload schema) |
| `from` | String | Yes | Sender component identifier |
| `to` | String | Yes | Target component identifier |
| `timestamp` | ISO-8601 | Yes | When message was created |
| `payload` | Object | Yes | Type-specific data (can be empty `{}`) |
| `replyTo` | UUID or null | Yes | Links to originating message for tracing |

Six fields. Fixed structure. The `type` field determines what `payload` contains.

#### Message Types

##### Agent Work

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `spawn-agent` | AIOO → PAW | `{task, stage, context, model}` | Spawn Agent SDK agent in stage container |
| `agent-report` | PAW → AIOO | `{status, result, tokens, duration}` | Agent completed or failed |

```json
// spawn-agent payload
{
  "task": "Implement user login flow",
  "stage": "procenteo-app-demo",
  "context": "memory-vault/procenteo/Specifications/auth.md",
  "model": "claude-opus-4-6"
}

// agent-report payload
{
  "status": "completed | failed | timeout",
  "result": "Login flow implemented. 3 files changed.",
  "tokens": 12400,
  "duration": "45s",
  "error": null
}
```

##### Human Messaging

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `human-message` | PAW → AIOO | `{channel, human, text, chatId, messageId}` | Human sent message via messaging |
| `human-reply` | AIOO → PAW | `{channel, text, hitlTier, chatId, inlineKeyboard?}` | AIOO response to human |

```json
// human-message payload (Telegram extended)
{
  "channel": "telegram-aioo-procenteo",
  "human": "michal",
  "text": "Yes, proceed to Stage 2",
  "chatId": "-1001234567890",
  "messageId": "42"
}

// human-reply payload (Telegram extended, with Micro-HITL inline keyboard)
{
  "channel": "telegram-aioo-procenteo",
  "text": "[procenteo] Stage 1 → Stage 2?",
  "hitlTier": "micro",
  "chatId": "-1001234567890",
  "inlineKeyboard": [
    [{ "text": "YES", "callback_data": "hitl:stage-transition:yes" }],
    [{ "text": "NO", "callback_data": "hitl:stage-transition:no" }]
  ]
}
```

- `chatId` — Telegram chat ID (numeric string). AIOO must echo from `human-message` back in `human-reply`.
- `messageId` — Telegram message ID. Used for inline keyboard `replyTo`.
- `inlineKeyboard` — optional array of button rows for Micro-HITL.

##### Stage Transitions

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `stage-signal` | AIOO → PAW | `{entity, app, fromStage, toStage}` | Request stage transition |
| `stage-ack` | PAW → AIOO | `{status, entity, app, fromStage, toStage, duration, reason}` | Transition result |

```json
// stage-signal payload
{
  "entity": "procenteo",
  "app": "procenteo",
  "fromStage": "demo",
  "toStage": "testing"
}

// stage-ack payload
{
  "status": "success | failed",
  "entity": "procenteo",
  "app": "procenteo",
  "fromStage": "demo",
  "toStage": "testing",
  "duration": "34s",
  "reason": null
}
```

##### AIOO Internal (Brain)

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `brain-request` | Daemon → Brain | `{prompt, context, taskId}` | Ask Gemini for judgment |
| `brain-response` | Brain → Daemon | `{decision, reasoning, tokens}` | Gemini's answer |

Note: brain-request/response may use in-process function calls rather
than filesystem IPC (they're internal to AIOO). Listed here for
completeness. If AIOO's Brain becomes a separate process in future,
it uses the same envelope format.

##### Diagnostics

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `debug-prompt` | PAW → AIOO | `{}` | Request assembled identity prompt |
| `debug-prompt-response` | AIOO → PAW | `{hash, prompt, files, language, assembledAt}` | Full prompt with metadata |

```json
// debug-prompt-response payload
{
  "hash": "sha256:a1b2c3...64chars",
  "prompt": "# Shared Personality\n\n...",
  "files": {
    "SOUL": "found",
    "IDENTITY": "found",
    "NORTHSTAR": "found",
    "GLOSSARY": "found",
    "CLAUDE": "found"
  },
  "language": "pl",
  "assembledAt": "2026-03-14T12:00:00.000Z"
}
```

##### System

| Type | From → To | Payload | Purpose |
|------|-----------|---------|---------|
| `health-ping` | Watchdog → any | `{}` | Health check request |
| `health-pong` | Any → Watchdog | `{status, uptime}` | Health check response |

#### Directory Layout

```
ipc/
├── aioo-procenteo/
│   ├── to-paw/              ← AIOO writes, NanoClaw-PAW reads
│   │   ├── msg-{uuid}.json
│   │   └── processed/
│   └── from-paw/            ← NanoClaw-PAW writes, AIOO reads
│       ├── msg-{uuid}.json
│       └── processed/
│
├── aioo-inisio/
│   ├── to-paw/
│   │   └── processed/
│   └── from-paw/
│       └── processed/
│
└── watchdog/
    ├── pings/               ← Watchdog writes
    │   └── processed/
    └── pongs/               ← Components write
        └── processed/
```

**Naming convention:** `{component}/to-{target}/` and `{component}/from-{source}/`

Each AIOO entity gets its own IPC namespace. No cross-entity IPC paths.
This means aioo-procenteo cannot accidentally read aioo-inisio's messages.

#### Write Protocol

Atomic writes prevent partial reads:

```
1. Generate message (JSON string)
2. Write to: {channel}/msg-{uuid}.json.tmp
3. Rename:   msg-{uuid}.json.tmp → msg-{uuid}.json
4. Done. Reader will pick it up on next poll.
```

Rename is atomic on all filesystems Docker supports.
Reader ignores `.tmp` files (only reads `.json`).

#### Read Protocol

```
1. List *.json in channel directory (sort by filename for order)
2. For each file:
   a. Read JSON
   b. Validate envelope (6 required fields)
   c. Route to handler based on `type`
   d. Handler processes message
   e. Move file to processed/ subdirectory
3. Sleep 1s
4. Repeat
```

#### Conversation Tracing

Every reply links to its origin via `replyTo`:

```
msg-001: {type: "spawn-agent", id: "aaa", replyTo: null}
msg-002: {type: "agent-report", id: "bbb", replyTo: "aaa"}

Trace command:
  jq 'select(.replyTo == "aaa")' ipc/aioo-procenteo/from-paw/*.json
  jq 'select(.id == "aaa")' ipc/aioo-procenteo/to-paw/processed/*.json
```

Full conversation chain is reconstructable from any message ID.

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| Write message to channel dir | Reader picks up within 1s, moves to processed/ |
| Write .tmp file to channel dir | Reader ignores it (no partial reads) |
| Send spawn-agent, receive agent-report | replyTo links them, jq trace works |
| Write to wrong channel dir | Target component never sees it |
| Reader goes down, comes back | Pending messages still in dir, processed on restart |
| Fill processed/ with 10k messages | Cleanup removes files older than retention period |
| Invalid envelope (missing field) | Reader logs error, moves to processed/ with error note |
| Cross-entity path attempt | No shared directories between entity namespaces |

## Implementer's Guide

Any component implementing IPC needs two things:

**1. Writer (send messages):**
```
writeMessage(channel, envelope) →
  validate envelope fields
  JSON.stringify
  write to .tmp
  rename to .json
```

**2. Reader (receive messages):**
```
pollChannel(channel, handlers) →
  every 1s:
    list *.json
    for each: validate → route to handler by type → move to processed/
```

This can be a shared library (~50 lines) used by AIOO, NanoClaw-PAW,
and any future component. Same code, same behavior, same debugging.

## Boundaries Enforced by IPC

The directory layout enforces architectural boundaries:

| Component | Can Write To | Can Read From |
|-----------|-------------|---------------|
| AIOO-procenteo | aioo-procenteo/to-paw/ | aioo-procenteo/from-paw/ |
| AIOO-inisio | aioo-inisio/to-paw/ | aioo-inisio/from-paw/ |
| NanoClaw-PAW | */from-paw/ (all entities) | */to-paw/ (all entities) |
| Host Watchdog | watchdog/pings/ | watchdog/pongs/ |

NanoClaw-PAW is the only component that reads from multiple entities —
it's the router. Each AIOO only sees its own namespace.

## References

- AIOO Decision A3: `./aioo-decisions.md`
- AIOO spec (IPC Handler module): `./aioo.md`
- Stage Lifecycle (stage-signal/ack): `./stage-lifecycle.md`
- NanoClaw-PAW (host process): `./nanoclaw-paw.md`
- Security patterns: `./security-patterns.md`
