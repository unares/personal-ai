# Clark — Design Decisions

> Architectural decisions for the Clark (Clarity Architect) component.
> Each decision records options considered, tradeoffs, and rationale.

## D1: Clark Network Isolation Model

**Date:** 2026-03-12
**Status:** Decided
**Context:** Clark spec originally said `--network none` (total air-gap), but Clark
needs to call the Anthropic API (via credential proxy at `host.docker.internal:3001`)
to think. `--network none` makes this physically impossible — a spec bug discovered
during NanoClaw-PAW build.

### Options Considered

```
Option A                    Option B                    Option C
True --network none         Infrastructure air-gap      Full independence
────────────────────        ────────────────────        ────────────────────
PAW does the thinking       Clark thinks (own API)      Clark thinks + messages
Clark = vault reader only   PAW relays messages         PAW not involved
No container LLM calls      clark-net (internet only)   clark-net (internet only)
                            No Docker-internal routes   Own NanoClaw instance
```

| Dimension        | A: True air-gap | B: Infra air-gap | C: Full independence |
|------------------|----------------|-------------------|----------------------|
| Simplicity       | Low            | High              | Medium               |
| Security         | Maximum        | High              | High                 |
| Air-gap intent   | Total          | From AIOO/infra   | From AIOO/infra      |
| Clark independence | None         | High              | Maximum              |
| Complexity cost  | PAW = Clark's brain | One network def | Duplicates messaging |

### Decision: Option B — Infrastructure Air-Gap

**Rationale:** The air-gap intent is independence from AIOO, not zero networking.
Clark needs network access to think (call Anthropic API). Option B delivers AIOO
isolation with minimal complexity:

- `clark-net` Docker network: internet access, no routes to `procenteo-net`/`inisio-net`
- Clark calls Anthropic API through credential proxy (existing security pattern)
- NanoClaw-PAW relays human messages via filesystem IPC (single messaging layer)
- Distilled/ mounted read-only (unchanged)
- Clark is a self-contained thinking agent, not a PAW shell

Option A rejected: makes PAW responsible for Clark's intelligence (tight coupling,
breaks Clark's independence JTBD). Option C rejected: duplicates messaging
infrastructure for no additional security benefit.

### What This Changes

- Clark spec: AC2 updated (network isolation = no entity nets, not no network)
- Clark spec: must-do constraint added (run on clark-net)
- Docker Compose topology: `docker run` command updated from `--network none` to `--network clark-net`
- Security patterns: network isolation table updated with Clark's actual access
- NanoClaw-PAW: creates `clark-net` at startup if it doesn't exist

### Principle

**Isolation means minimizing attack surface to what's necessary, not maximizing
restriction beyond what's functional.** Zero network sounds secure but forces
complexity elsewhere (PAW-as-brain), which creates a larger, harder-to-audit
attack surface than a constrained network.

## References

- Clark spec: `./clark.md`
- Security patterns: `./security-patterns.md`
- Docker Compose topology: `./docker-compose-topology.md`
- NanoClaw-PAW spec: `./nanoclaw-paw.md`
