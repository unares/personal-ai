# Docker Compose Topology — Specification

> The physical wiring. Every container, network, volume, and profile.
> Date: 2026-03-12

## JTBD

"When I run `docker compose up` with the right profiles, I want the
exact containers, networks, and volumes for my entities to come up
correctly — isolated per entity, secure by default, debuggable by
inspection — so I can trust the infrastructure and focus on building."

## The 5 Primitives

### 1. Problem Statement

Personal AI Workspace has 12 Compose services across 2 entities, plus
3 host-level components. These need to be wired with correct network
isolation (per-entity), volume mounts (vault + IPC), health checks,
restart policies, and profile activation. The topology must enforce
architectural boundaries: entity isolation, Clark air-gap, ai-gateway
per entity, and security patterns (no socket mounting, credential proxy,
mount security).

### 2. Acceptance Criteria

1. `docker compose --profile procenteo --profile procenteo-app-demo up`
   starts exactly: Chronicle, ai-gateway-procenteo, aioo-procenteo,
   procenteo-app-demo — nothing else.
2. From inside aioo-procenteo, `ping ai-gateway-inisio` fails
   (entity network isolation).
3. All containers have health checks. `docker compose ps` shows health
   status for every running service.
4. After `docker compose down && docker compose up` with same profiles,
   all state is preserved (vault on bind mount, Chronicle index on
   named volume).
5. `docker compose config` with any valid profile combination produces
   valid YAML with no port conflicts, no orphan networks, no missing
   volumes.

### 3. Constraint Architecture

**Must do:**
- Per-entity networks (procenteo-net, inisio-net)
- Profiles for activation control (nothing runs without explicit profile)
- Health checks on every service
- Restart policies (`unless-stopped` for persistent services)
- Bind mounts for vault and IPC (survive container recreation)
- Named volume for Chronicle index only

**Must not do:**
- Mount Docker socket into any container (Anti-pattern #5)
- Put containers from different entities on the same network
  (except Chronicle, which serves all entities read-only)
- Use host networking mode (breaks isolation)
- Hardcode API keys in compose file (credential proxy handles this)

**Preferences:**
- Chronicle has no profile (always starts with any `up` command)
- One compose file (not split across multiple files)
- Consistent naming: `{entity}-{component}` or `{app}-app-{stage}`

### 4. Decomposition

#### Full Container Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Compose                                                      │
│                                                                      │
│  ALWAYS ON (no profile):                                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  chronicle                                                     │ │
│  │  Networks: procenteo-net, inisio-net                           │ │
│  │  Volume: memory-vault (bind, read-only), memory-vault-index    │ │
│  │  Port: 8181 (Docker network only, not host-exposed)            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  PROFILE: procenteo                                                 │
│  ┌──────────────────────────┐  ┌───────────────────────────────┐   │
│  │  aioo-procenteo          │  │  ai-gateway-procenteo         │   │
│  │  Network: procenteo-net  │  │  Network: procenteo-net       │   │
│  │  Vault: r/w              │  │  Vault: none                  │   │
│  │  IPC: r/w                │  │  Config: bind mount           │   │
│  └──────────────────────────┘  └───────────────────────────────┘   │
│                                                                      │
│  PROFILE: procenteo-app-demo          (one active at a time)        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  procenteo-app-demo                                            │ │
│  │  Network: procenteo-net                                        │ │
│  │  Vault: r/w                                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  PROFILE: procenteo-app-testing                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  procenteo-app-testing  (same pattern)                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  PROFILE: procenteo-app-launch                                      │
│  PROFILE: procenteo-app-scaling                                     │
│                                                                      │
│  PROFILE: inisio                                                    │
│  ┌──────────────────────────┐  ┌───────────────────────────────┐   │
│  │  aioo-inisio             │  │  ai-gateway-inisio            │   │
│  │  Network: inisio-net     │  │  Network: inisio-net          │   │
│  │  Vault: r/w              │  │  Config: bind mount           │   │
│  └──────────────────────────┘  └───────────────────────────────┘   │
│                                                                      │
│  PROFILE: inisio-app-demo                                           │
│  PROFILE: inisio-app-testing                                        │
│  PROFILE: inisio-app-launch                                         │
│  PROFILE: inisio-app-scaling                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

NOT in Compose (host-level):
  NanoClaw-PAW    — Node.js host process, reads IPC dirs, Docker access
  Clark           — spawned by PAW via docker run --rm, no entity network
  Host Watchdog   — cron script, checks container health
```

#### Networks

```
┌─ procenteo-net ───────────────────────────────────────────┐
│                                                            │
│  aioo-procenteo ◄──► ai-gateway-procenteo                 │
│       ▲                      ▲                             │
│       │                      │                             │
│       ▼                      │                             │
│  procenteo-app-{stage} ─────┘                             │
│       │                                                    │
│       ▼                                                    │
│  chronicle ─────────────────────────────────── (shared)   │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ inisio-net ──────────────────────────────────────────────┐
│                                                            │
│  aioo-inisio ◄──► ai-gateway-inisio                       │
│       ▲                  ▲                                 │
│       │                  │                                 │
│       ▼                  │                                 │
│  inisio-app-{stage} ────┘                                 │
│       │                                                    │
│       ▼                                                    │
│  chronicle ─────────────────────────────────── (shared)   │
│                                                            │
└────────────────────────────────────────────────────────────┘

Clark: no compose network. NanoClaw-PAW creates with --network none
       or a dedicated clark-net with no routes to entity networks.
```

| Network | Members | Purpose |
|---------|---------|---------|
| `procenteo-net` | aioo-procenteo, ai-gateway-procenteo, procenteo-app-*, chronicle | Procenteo entity isolation |
| `inisio-net` | aioo-inisio, ai-gateway-inisio, inisio-app-*, chronicle | Inisio entity isolation |

Cross-entity access: impossible. aioo-procenteo has no route to
ai-gateway-inisio or any inisio container. Enforced by Docker networking.

#### Volumes

| Volume | Type | Mounted To | Mode | Purpose |
|--------|------|------------|------|---------|
| `./memory-vault/procenteo` | Bind | aioo-procenteo, procenteo-app-* | r/w | Entity vault |
| `./memory-vault/inisio` | Bind | aioo-inisio, inisio-app-* | r/w | Entity vault |
| `./memory-vault` | Bind | chronicle | r/o | All vaults for indexing |
| `memory-vault-index` | Named | chronicle | r/w | FTS5 + sqlite-vec index |
| `./ipc/aioo-procenteo` | Bind | aioo-procenteo | r/w | IPC with NanoClaw-PAW |
| `./ipc/aioo-inisio` | Bind | aioo-inisio | r/w | IPC with NanoClaw-PAW |
| `./config/ai-gateway-procenteo` | Bind | ai-gateway-procenteo | r/o | LiteLLM config |
| `./config/ai-gateway-inisio` | Bind | ai-gateway-inisio | r/o | LiteLLM config |
| `./config/aioo-procenteo.json` | Bind | aioo-procenteo | r/o | AIOO config |
| `./config/aioo-inisio.json` | Bind | aioo-inisio | r/o | AIOO config |

IPC directories are bind mounts so NanoClaw-PAW (host process) can
read/write them directly. This is the filesystem IPC bridge between
host and containers.

#### Profiles

```
Profile activation examples:

# Just Chronicle (inspect mode):
docker compose up

# Procenteo entity + Demo stage:
docker compose --profile procenteo --profile procenteo-app-demo up -d

# Both entities, each at different stages:
docker compose --profile procenteo --profile procenteo-app-testing \
               --profile inisio --profile inisio-app-demo up -d

# Add second entity to running system:
docker compose --profile inisio --profile inisio-app-demo up -d
```

| Profile | Services Started |
|---------|-----------------|
| *(none)* | chronicle |
| `procenteo` | aioo-procenteo, ai-gateway-procenteo |
| `procenteo-app-demo` | procenteo-app-demo |
| `procenteo-app-testing` | procenteo-app-testing |
| `procenteo-app-launch` | procenteo-app-launch |
| `procenteo-app-scaling` | procenteo-app-scaling |
| `inisio` | aioo-inisio, ai-gateway-inisio |
| `inisio-app-demo` | inisio-app-demo |
| `inisio-app-testing` | inisio-app-testing |
| `inisio-app-launch` | inisio-app-launch |
| `inisio-app-scaling` | inisio-app-scaling |

Stage transitions (managed by NanoClaw-PAW stage handler):
```
# NanoClaw-PAW executes on stage-signal:
docker compose --profile procenteo-app-testing up -d   # new stage up
# ... health check ...
docker compose --profile procenteo-app-demo down       # old stage down
```

#### Service Configuration

##### Chronicle (always on)

| Setting | Value |
|---------|-------|
| Image | `chronicle:latest` (local build) |
| Profiles | *(none — always starts)* |
| Networks | procenteo-net, inisio-net |
| Volumes | `./memory-vault:r/o`, `memory-vault-index:r/w` |
| Restart | `unless-stopped` |
| Health check | HTTP GET :8181/health |
| Ports | 8181 (container only, not host-exposed) |

##### ai-gateway-{entity}

| Setting | Value |
|---------|-------|
| Image | `litellm/litellm:latest` |
| Profiles | `{entity}` |
| Networks | `{entity}-net` |
| Volumes | `./config/ai-gateway-{entity}:r/o` |
| Restart | `unless-stopped` |
| Health check | HTTP GET :4000/health |
| Ports | 4000 (container only, not host-exposed) |
| Env | `LITELLM_CONFIG_DIR=/config` |

##### aioo-{entity}

| Setting | Value |
|---------|-------|
| Image | `aioo:latest` (local build) |
| Profiles | `{entity}` |
| Networks | `{entity}-net` |
| Volumes | `./memory-vault/{entity}:r/w`, `./ipc/aioo-{entity}:r/w`, `./config/aioo-{entity}.json:r/o` |
| Restart | `unless-stopped` |
| Health check | Heartbeat file check or HTTP endpoint |
| Env | `ENTITY={entity}`, `AI_GATEWAY_URL=http://ai-gateway-{entity}:4000`, `CHRONICLE_URL=http://chronicle:8181` |

##### {app}-app-{stage}

| Setting | Value |
|---------|-------|
| Image | `app-dev-stage:{stage}` (local build, per-stage image) |
| Profiles | `{app}-app-{stage}` |
| Networks | `{entity}-net` |
| Volumes | `./memory-vault/{entity}:r/w` |
| Restart | `unless-stopped` |
| Health check | Per-stage (HTTP or process check) |
| Env | `ENTITY={entity}`, `APP={app}`, `STAGE={stage}`, `AI_GATEWAY_URL=http://ai-gateway-{entity}:4000`, `CHRONICLE_URL=http://chronicle:8181` |

#### Host-Level Components (Not in Compose)

| Component | How It Runs | Docker Access | IPC Access |
|-----------|-------------|---------------|------------|
| NanoClaw-PAW | Node.js process (systemd or manual) | Yes (host Docker CLI) | Yes (reads/writes `./ipc/`) |
| Clark | `docker run --rm` by NanoClaw-PAW | N/A (is a container) | No (vault mount only) |
| Host Watchdog | Cron job (every 60s) | Yes (`docker inspect`) | No |

Clark container spawned by NanoClaw-PAW:
```
docker run --rm \
  --network none \
  -v ./memory-vault/{entity}/Distilled:/vault/Distilled:ro \
  -e ANTHROPIC_BASE_URL=http://host.docker.internal:3001 \
  -e ANTHROPIC_API_KEY=placeholder-not-real \
  clark:latest
```

- `--network none`: air-gap enforced at Docker level
- Distilled/ read-only: only refined knowledge
- Credential proxy: placeholder key, real key injected by host proxy

#### Security Validation Checklist

| Check | How to Verify |
|-------|---------------|
| No Docker socket mounted | `grep -r "docker.sock" docker-compose.yml` → no results |
| Entity network isolation | `docker exec aioo-procenteo ping ai-gateway-inisio` → fails |
| Clark air-gap | `docker exec clark-michal ping aioo-procenteo` → fails |
| No real API keys in containers | `docker exec aioo-procenteo env \| grep API` → placeholder only |
| Vault mount permissions | `docker exec aioo-procenteo touch /vault/test` → works (r/w) |
| Chronicle read-only vault | `docker exec chronicle touch /vault/test` → fails (r/o) |
| No host-exposed ports | `docker compose port chronicle 8181` → empty (internal only) |
| IPC directory isolation | `ls ipc/aioo-procenteo/` visible, `ipc/aioo-inisio/` separate |

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| `docker compose up` (no profiles) | Only Chronicle starts |
| `docker compose --profile procenteo --profile procenteo-app-demo up` | Chronicle + aioo + gateway + demo = 4 containers |
| `docker compose ps` | All running containers show healthy |
| `docker compose down && up` (same profiles) | State preserved, task graph intact |
| Add `--profile inisio` to running system | Inisio containers start, procenteo unaffected |
| Stage transition (demo → testing) | New container healthy before old removed |
| `docker network inspect procenteo-net` | Only procenteo containers listed |
| Full security checklist (above) | All checks pass |

## Conceptual docker-compose.yml

```yaml
# Personal AI Workspace — Docker Compose
# See: memory-vault/ai-workspace/Specifications/docker-compose-topology.md

networks:
  procenteo-net:
    driver: bridge
  inisio-net:
    driver: bridge

volumes:
  memory-vault-index:

services:

  # ── Always On ──────────────────────────────────────────

  chronicle:
    build: ./chronicle
    restart: unless-stopped
    networks: [procenteo-net, inisio-net]
    volumes:
      - ./memory-vault:/vault:ro
      - memory-vault-index:/index
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8181/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # ── Procenteo Entity ───────────────────────────────────

  ai-gateway-procenteo:
    image: litellm/litellm:latest
    profiles: [procenteo]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./config/ai-gateway-procenteo:/config:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  aioo-procenteo:
    build: ./containers/aioo
    profiles: [procenteo]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./memory-vault/procenteo:/vault
      - ./ipc/aioo-procenteo:/ipc
      - ./config/aioo-procenteo.json:/config/aioo.json:ro
    environment:
      ENTITY: procenteo
      AI_GATEWAY_URL: http://ai-gateway-procenteo:4000
      CHRONICLE_URL: http://chronicle:8181
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 5s
      retries: 3

  procenteo-app-demo:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: demo}
    profiles: [procenteo-app-demo]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./memory-vault/procenteo:/vault
    environment:
      ENTITY: procenteo
      APP: procenteo
      STAGE: demo
      AI_GATEWAY_URL: http://ai-gateway-procenteo:4000
      CHRONICLE_URL: http://chronicle:8181

  procenteo-app-testing:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: testing}
    profiles: [procenteo-app-testing]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./memory-vault/procenteo:/vault
    environment:
      ENTITY: procenteo
      APP: procenteo
      STAGE: testing
      AI_GATEWAY_URL: http://ai-gateway-procenteo:4000
      CHRONICLE_URL: http://chronicle:8181

  procenteo-app-launch:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: launch}
    profiles: [procenteo-app-launch]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./memory-vault/procenteo:/vault
    environment:
      ENTITY: procenteo
      APP: procenteo
      STAGE: launch
      AI_GATEWAY_URL: http://ai-gateway-procenteo:4000
      CHRONICLE_URL: http://chronicle:8181

  procenteo-app-scaling:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: scaling}
    profiles: [procenteo-app-scaling]
    restart: unless-stopped
    networks: [procenteo-net]
    volumes:
      - ./memory-vault/procenteo:/vault
    environment:
      ENTITY: procenteo
      APP: procenteo
      STAGE: scaling
      AI_GATEWAY_URL: http://ai-gateway-procenteo:4000
      CHRONICLE_URL: http://chronicle:8181

  # ── Inisio Entity ──────────────────────────────────────

  ai-gateway-inisio:
    image: litellm/litellm:latest
    profiles: [inisio]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./config/ai-gateway-inisio:/config:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  aioo-inisio:
    build: ./containers/aioo
    profiles: [inisio]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./memory-vault/inisio:/vault
      - ./ipc/aioo-inisio:/ipc
      - ./config/aioo-inisio.json:/config/aioo.json:ro
    environment:
      ENTITY: inisio
      AI_GATEWAY_URL: http://ai-gateway-inisio:4000
      CHRONICLE_URL: http://chronicle:8181
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 5s
      retries: 3

  inisio-app-demo:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: demo}
    profiles: [inisio-app-demo]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./memory-vault/inisio:/vault
    environment:
      ENTITY: inisio
      APP: inisio
      STAGE: demo
      AI_GATEWAY_URL: http://ai-gateway-inisio:4000
      CHRONICLE_URL: http://chronicle:8181

  inisio-app-testing:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: testing}
    profiles: [inisio-app-testing]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./memory-vault/inisio:/vault
    environment:
      ENTITY: inisio
      APP: inisio
      STAGE: testing
      AI_GATEWAY_URL: http://ai-gateway-inisio:4000
      CHRONICLE_URL: http://chronicle:8181

  inisio-app-launch:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: launch}
    profiles: [inisio-app-launch]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./memory-vault/inisio:/vault
    environment:
      ENTITY: inisio
      APP: inisio
      STAGE: launch
      AI_GATEWAY_URL: http://ai-gateway-inisio:4000
      CHRONICLE_URL: http://chronicle:8181

  inisio-app-scaling:
    build:
      context: ./containers/app-dev-stage
      args: {STAGE: scaling}
    profiles: [inisio-app-scaling]
    restart: unless-stopped
    networks: [inisio-net]
    volumes:
      - ./memory-vault/inisio:/vault
    environment:
      ENTITY: inisio
      APP: inisio
      STAGE: scaling
      AI_GATEWAY_URL: http://ai-gateway-inisio:4000
      CHRONICLE_URL: http://chronicle:8181
```

Note: This is the conceptual target. The actual docker-compose.yml will
be created during implementation, potentially with YAML anchors to reduce
repetition across stage definitions.

## Adding a New Entity

When a third entity joins (e.g. `acme`):

1. Create network: add `acme-net` to networks section
2. Add Chronicle to network: append `acme-net` to chronicle's networks
3. Copy entity block: duplicate procenteo section, replace names
4. Create config: `config/ai-gateway-acme/`, `config/aioo-acme.json`
5. Create vault: `memory-vault/acme/` with standard structure
6. Create IPC: `ipc/aioo-acme/` with `to-paw/` and `from-paw/`

Pattern is mechanical. Could be scripted (extend `add-entity.sh`).

## References

- AIOO spec: `./aioo.md`
- ai-gateway: `./ai-gateway.md`
- App Dev Stages: `./app-dev-stages.md`
- IPC Protocol: `./ipc-protocol.md`
- Stage Lifecycle: `./stage-lifecycle.md`
- Clark: `./clark.md` (not in Compose — spawned by NanoClaw-PAW)
- Security Patterns: `./security-patterns.md`
- NanoClaw-PAW: `./nanoclaw-paw.md` (not in Compose — host process)
- Architecture: `memory-vault/ARCHITECTURE.md`
