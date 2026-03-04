# Mount Conventions — Container Security Model

> Do One Thing. Earn Full Autonomy.

## Container Access Matrix

| Container | /vault | /workspace | Docker Socket | Network | LLM |
|-----------|--------|-----------|---------------|---------|-----|
| AIOO | entity vault (rw) | NanoClaw | YES (restricted) | personal-ai-net | Hybrid (Gemini+Claude) |
| Clark | Distilled/ (ro) | NanoClaw | NO | personal-ai-net | Claude |
| App Builder | Distilled/ (ro) | app code (rw) | NO | personal-ai-net | Claude |
| Context Extractor | full vault (rw) | /app | NO | personal-ai-net | None |
| LiteLLM Proxy | none | none | NO | personal-ai-net | Proxy only |

## Mount Patterns

### AIOO (Orchestrator)
```
-v "$VAULT_PATH/$ENTITY:/vault"                              # Full vault, read-write
-v "$NS_PATH:/vault/NORTHSTAR.md:ro"                         # Northstar, read-only
-v "/var/run/docker.sock:/var/run/docker.sock"               # Docker socket (restricted)
-v "$NANOCLAW_CONFIG/aioo/CLAUDE.md:/opt/nanoclaw/groups/main/CLAUDE.md:ro"
-v "$NANOCLAW_CONFIG/aioo/skills:/opt/nanoclaw/.claude/skills/aioo:ro"
-v "$NANOCLAW_CONFIG/skills:/opt/nanoclaw/.claude/skills/shared:ro"
-v "$WHATSAPP_AUTH:/opt/nanoclaw/data/whatsapp"
```

### Clark (Clarity Architect)
```
-v "$CLARK_DIR:/vault/$PROJ/Distilled/Clark:ro"              # Per-entity, read-only
-v "$NS_PATH:/vault/$PROJ/NORTHSTAR.md:ro"                   # Per-entity, read-only
-v "$NANOCLAW_CONFIG/clark/CLAUDE.md:/opt/nanoclaw/groups/main/CLAUDE.md:ro"
-v "$NANOCLAW_CONFIG/skills:/opt/nanoclaw/.claude/skills/shared:ro"
-v "$WHATSAPP_AUTH:/opt/nanoclaw/data/whatsapp"
```
No Docker socket. No write access to vault.

### App Builder
```
-v "$VAULT_PATH/$ENTITY/Distilled:/vault/Distilled:ro"      # Context, read-only
-v "$NS_PATH:/workspace/NORTHSTAR.md:ro"                     # Vision, read-only
-v "$CLAUDE_MD:/workspace/CLAUDE.md:ro"                      # Instructions, read-only
```
No Docker socket. No full vault access. No NanoClaw.

## Security Rules

1. **Principle of least privilege**: Each container gets only the mounts it needs
2. **Read-only by default**: Vault mounts are `:ro` unless the agent needs write access
3. **No privileged containers**: Docker socket is mounted but `--privileged` is denied
4. **Network isolation**: All containers share `personal-ai-net` but have no host network access
5. **No secret leakage**: API keys via env vars only, never in mounted files

## Blocked Patterns

AIOO's mount allowlist prevents spawning containers with access to:
- `~/.ssh/`, `~/.gnupg/`, `~/.aws/` — credential directories
- `.env` files — API keys
- `/etc/shadow`, `/etc/passwd` — system files
- Host root filesystem

---

## Mission Alignment
Security enables autonomy. The system can only earn expanded permissions by demonstrating it handles current permissions responsibly. Explicit mount conventions make the security model auditable — humans can verify what each container can access.

## Scope
Defines Docker mount patterns, access matrix, and security rules for all container types. Does NOT define container behavior or NanoClaw internals.

## Interfaces
- **Read by**: Humans (auditing), launcher scripts (implementing), AIOO (spawn constraints)
- **Written by**: Human (system architect)
- **Depends on**: Docker, launcher scripts, NanoClaw container-runner

## Outcomes
- Every container's access is explicit and documented
- Security model is auditable by humans
- Principle of least privilege is enforced consistently
- No accidental credential exposure

## Gamification Hooks
- [ ] Mount correctness: % of containers launched with correct mount patterns → compliance score
- [ ] Security incidents: count of blocked mount attempts → defense effectiveness
- [ ] Audit coverage: % of container types with documented mount conventions → completeness

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial mount conventions spec | System |
