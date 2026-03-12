---
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*"
  - "**/entrypoint*"
  - "containers/**"
---

# Docker Rules

- All agent containers use `containers/{agent}/` directory structure
- Agent identity is injected as `~/.claude/CLAUDE.md` inside the container
- Project CLAUDE.md is mounted read-only at `/workspace/CLAUDE.md`
- Vault is mounted at `/vault/` with access scoped per agent role
- Never mount Docker socket (`/var/run/docker.sock`) into any container
- Never use `--privileged` flag
- Use per-entity networks (`procenteo-net`, `inisio-net`) — not a shared network
- Clark runs with `--network none` (air-gapped, spawned by NanoClaw-PAW)
- Container entrypoints use `participate.sh` for Claude Code CLI entry
