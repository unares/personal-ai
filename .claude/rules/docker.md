---
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*"
  - "containers/**"
---

# Docker Rules

- All agent containers use `containers/{agent}/` directory structure
- Agent identity is injected as `~/.claude/CLAUDE.md` inside the container
- Project CLAUDE.md is mounted read-only at `/workspace/CLAUDE.md`
- Vault is mounted at `/vault/` with access scoped per agent role
- Docker socket is mounted only for AIOO (NanoClaw needs it)
- Never use `--privileged` flag
- Always use the `personal-ai-net` bridge network
- Container entrypoints use `participate.sh` for Claude Code CLI entry
