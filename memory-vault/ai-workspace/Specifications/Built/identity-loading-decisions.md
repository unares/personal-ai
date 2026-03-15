# Identity Loading — Architectural Decisions

> Decisions made during identity loading spec-engineering. Each decision captures
> the options considered, the choice made, and the rationale.
> Date: 2026-03-14

## Decision IL1: AIOO Identity Loading Mechanism

**Question:** How does AIOO's brain-client assemble its system prompt from identity files?

**Answer: Option A — Direct file reads at startup, 5 files in fixed order.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Direct file reads | Read 5 files in order at init() | Simple, predictable, no file watcher overhead |
| B. File watcher | Watch identity files, rebuild prompt on change | Real-time updates but adds complexity + inotify overhead |
| C. Config-driven paths | Paths in config JSON, not hardcoded | Flexible but over-engineered for 5 fixed files |

### Why Option A

AIOO is a daemon — it restarts when identity changes matter. File watchers add
complexity for a scenario (mid-runtime identity change) that doesn't exist in
practice. The 5-file order is architectural, not configurable — encoding it in
code is correct.

### File Order (Assembly Sequence)

```
1. /identity/SOUL.md           — shared personality anchor (all companions)
2. /identity/AIOO_IDENTITY.md  — companion-specific role and behavior
3. /vault/{ENTITY}_NORTHSTAR.md — entity vision (human-owned, read-only)
4. /vault/{ENTITY}_GLOSSARY.md  — entity terminology (human-owned, read-only)
5. /identity/CLAUDE.md          — operational context (daemon modules, IPC, debugging)
```

### What This Changes

- `containers/aioo/src/brain-client.js` → renamed to `aioo-brain-client.js`, buildMessages() rewritten
- `docker-compose.yml` → 3 new read-only mounts per AIOO service
- `containers/aioo/Dockerfile` → no change (identity not baked in)

## Decision IL2: Language Instruction Source

**Question:** How does AIOO know which language to use when communicating?

**Answer: Option A — Add "language" field to aioo-{entity}.json config.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Config field | `"language": "pl"` in aioo-{entity}.json | Simple, per-entity, already-loaded config |
| B. NORTHSTAR extraction | Parse language from NORTHSTAR text | Fragile — depends on NORTHSTAR format |
| C. Env var | `LANGUAGE=pl` in docker-compose.yml | Works but scatters config |

### Why Option A

Language is per-entity configuration, not identity. Config files already hold
per-entity settings (brain model, budget, HITL rules). Adding one field is minimal.
The brain-client reads config at init — language is available without extra I/O.

### Injection Pattern

After assembling the 5-file prompt, append a language instruction line:
```
Language: Communicate in {language name} ({code}). Code and logs always in English.
```

Language map: `{ "pl": "Polish", "en": "English" }`

### What This Changes

- `config/aioo-procenteo.json` → add `"language": "pl"`
- `config/aioo-inisio.json` → add `"language": "en"`
- `containers/aioo/src/aioo-brain-client.js` → language line appended to system prompt

## Decision IL3: Prompt Assembly Observability

**Question:** How do we verify what system prompt AIOO is actually using?

**Answer: Option C — SHA-256 hash to logs on startup + dump-on-demand via IPC.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Full prompt to logs | Log entire assembled prompt on startup | Noise — multi-KB text in every startup log |
| B. Hash only | SHA-256 of assembled prompt, logged on startup | Detects changes but can't inspect content |
| C. Hash + debug dump | Hash on startup + IPC `debug-prompt` command | Best of both — minimal noise, full inspection on demand |

### Why Option C

Hash-on-startup catches unintended changes (file edit, mount misconfiguration).
Debug-prompt IPC command lets a human (or Unares) inspect the full prompt without
restarting the container. Minimal logging footprint during normal operation.

### IPC Messages

Request:
```json
{
  "type": "debug-prompt",
  "from": "nanoclaw-paw",
  "to": "aioo-{entity}",
  "payload": {}
}
```

Response:
```json
{
  "type": "debug-prompt-response",
  "from": "aioo-{entity}",
  "to": "nanoclaw-paw",
  "payload": {
    "hash": "sha256:abc123...",
    "prompt": "full assembled prompt text",
    "files": { "SOUL.md": "found", "AIOO_IDENTITY.md": "found", ... },
    "language": "pl",
    "assembledAt": "ISO-8601"
  }
}
```

### What This Changes

- `containers/aioo/src/aioo-brain-client.js` → hash computation + logging at init
- `containers/aioo/src/ipc-handler.js` → new `debug-prompt` message type handler
- IPC protocol: new message type pair (debug-prompt / debug-prompt-response)

## References

- Identity loading spec: `./identity-loading.md`
- AIOO decisions: `../Built/aioo-decisions.md`
- IPC protocol spec: `../Built/ipc-protocol.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
