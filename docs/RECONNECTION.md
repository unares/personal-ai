# Reconnection — Session Persistence & Recovery

> Do One Thing. Earn Full Autonomy.

## WhatsApp Session Persistence

WhatsApp auth data is stored outside containers at `~/.config/personal-ai/whatsapp/`. This survives container rebuilds and restarts.

```
~/.config/personal-ai/whatsapp/
  auth_info_baileys/
    creds.json          # WhatsApp credentials
    ...                 # Session keys
```

Mounted into NanoClaw containers at `/opt/nanoclaw/data/whatsapp`.

## Message Recovery

NanoClaw's `recoverPendingMessages` handles messages received while the container was down:
- Messages are queued by WhatsApp's multi-device protocol
- On reconnection, NanoClaw processes the backlog in order
- No messages are lost during container restarts

## Container Restart Policies

| Container | Restart Policy | Reason |
|-----------|---------------|--------|
| Context Extractor | `unless-stopped` | Always-on service |
| LiteLLM Proxy | `unless-stopped` | Always-on service |
| AIOO | none (manual via aioo.sh) | Started per-entity as needed |
| Clark | none (manual via clark.sh) | Started per-person as needed |
| App Builder | none (ephemeral) | Spawned per-task, disposable |

## Recovery Checklist

If the system goes down:

1. `docker compose --profile seed up -d` — restarts Context Extractor + LiteLLM
2. `./aioo/aioo.sh <entity>` — restarts AIOO (WhatsApp reconnects automatically)
3. `./clark/clark.sh <person>` — restarts Clark (WhatsApp reconnects automatically)
4. App Builders are ephemeral — re-spawn as needed

---

## Mission Alignment
Resilience enables sustained autonomy. A system that loses state on restart cannot be trusted with long-running tasks. Persistent auth, message recovery, and clear restart procedures ensure continuity.

## Scope
Defines session persistence, message recovery, and container restart behavior. Does NOT define NanoClaw internals or WhatsApp protocol details.

## Interfaces
- **Read by**: Humans (recovery procedures), ops scripts
- **Written by**: Human (system architect)
- **Depends on**: NanoClaw (message recovery), Docker (restart policies), filesystem (auth persistence)

## Outcomes
- Zero message loss during container restarts
- WhatsApp sessions persist across rebuilds
- Clear recovery procedures for system-wide outages
- Appropriate restart policies per container type

## Gamification Hooks
- [ ] Uptime %: container availability over time → reliability score
- [ ] Reconnection speed: time from restart to WhatsApp reconnection → resilience signal
- [ ] Message delivery rate: % of messages successfully processed → reliability
- [ ] Recovery time: total time to recover from system-wide outage → operational readiness

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial reconnection and persistence spec | System |
