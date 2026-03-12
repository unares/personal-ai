# Security Patterns — Cherry-Picked from NanoClaw

> Apply before any agent runs. These are prerequisites, not nice-to-haves.
> Date: 2026-03-11
> Source: NanoClaw research — `../Research/nanoclaw-architecture-analysis.md`

## Pattern 1: Credential Proxy

**What:** HTTP proxy on the host intercepts API calls from containers,
strips placeholder keys, injects real API keys, forwards to the provider.

**Why:** Containers never see real API keys. If a container is compromised,
the attacker gets a placeholder that works nowhere.

**NanoClaw source:** `credential-proxy.ts`

```
Container env:
  ANTHROPIC_BASE_URL=http://host.docker.internal:3001
  ANTHROPIC_API_KEY=placeholder-not-real

Container makes API call → hits host proxy → proxy injects real key →
forwards to Anthropic → response back to container

Real key exists only in: host process memory
Real key never in: container env, /proc, stdin, files, logs
```

**Apply to:**
- NanoClaw-PAW (manages Clark containers)
- ai-gateway (manages Agent SDK LLM calls)
- Both implement the same principle at different layers

## Pattern 2: Mount Security

**What:** Allowlist + blocklist for volume mounts. Every mount is
validated before container creation.

**Why:** Prevents containers from accessing sensitive host paths.

**NanoClaw source:** `mount-security.ts`

**Blocklist (never mount):**
- `.ssh/`, `.aws/`, `.docker/`
- `credentials`, `.env`, `id_rsa`, `private_key`
- Any path containing `secret`, `token`, `password`

**Allowlist (per container type):**

| Container | Allowed Mounts | Mode |
|-----------|---------------|------|
| Clark | `memory-vault/{entity}/Distilled/` | read-only |
| AIOO | `memory-vault/{entity}/` | read-write |
| App Dev Stage | `memory-vault/{entity}/` + app workspace | read-write |
| Chronicle | `memory-vault/` (all entities) | read-only |
| ai-gateway | Config only (no vault) | — |

**Additional protections:**
- `.env` shadow-mounted to `/dev/null` in any project root mount
- Symlink resolution before validation (prevent mount escape)
- Non-main groups forced read-only on additional mounts

## Pattern 3: Container Trust Boundaries

**What:** Each container type gets minimum required access. No container
gets more than it needs.

```
┌────────────────────────────────────────────────────────────────────┐
│  Trust Level    Container           Access                         │
├────────────────────────────────────────────────────────────────────┤
│  Highest        AIOO                Full vault r/w, ai-gateway,   │
│                                     stage container signals        │
│                                                                    │
│  Medium         App Dev Stage       Vault r/w, ai-gateway,        │
│                                     no stage transition signals    │
│                                                                    │
│  Low            Clark               Distilled/ read-only,         │
│                                     no AIOO network, no ai-gateway │
│                                                                    │
│  Infrastructure Chronicle           All vaults read-only           │
│                 ai-gateway          No vault access, API keys only │
└────────────────────────────────────────────────────────────────────┘
```

## Pattern 4: Network Isolation

**What:** Docker network rules prevent unauthorized container-to-container
communication.

| From | To | Allowed? |
|------|----|----------|
| Clark | AIOO | No (air-gap) |
| Clark | ai-gateway | No |
| Clark | Chronicle | Maybe (for vault search) |
| AIOO | ai-gateway | Yes |
| AIOO | Chronicle | Yes |
| AIOO | Stage container | Yes |
| Stage container | ai-gateway | Yes |
| Stage container | Chronicle | Yes |

## Pattern 5: No Docker Socket Mounting

**What:** Never mount `/var/run/docker.sock` into any container.
This gives root-equivalent access to the entire host.

**Anti-pattern #5 in architecture reference.** Flagged immediately if
detected. No exceptions.

## Application Order

Apply these patterns in this order:
1. Mount security (blocklist + allowlist) — prevents access to sensitive paths
2. Credential proxy — prevents API key leakage
3. Network isolation — prevents unauthorized container communication
4. Trust boundaries — validates access levels per container type
5. Socket prohibition — verified in docker-compose.yml review

## References

- NanoClaw research: `../Research/nanoclaw-architecture-analysis.md`
- NanoClaw-PAW spec: `./nanoclaw-paw.md`
- Architecture reference: `.claude/skills/architecture-design/reference.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
