---
paths:
  - "setup/**"
  - "profiles/**"
  - "config.json"
---

# Setup & Profile Rules

- Scripts in `setup/` manage workspace infrastructure: entity creation, verification, sync
- All setup scripts use `set -euo pipefail` and source `version.sh`
- `config.json` is gitignored — never commit it. It holds owner, entity names, co-founder names
- Profile settings.json files must include `ENABLE_LSP_TOOL=1` in env
- Profile activation copies `settings.json` and `CLAUDE.md` to `~/.claude/`
- Templates live in `setup/templates/` — read by scripts at runtime
- Entity management: `add-entity.sh` creates vault dirs + updates config.json
- Human management: `add-human.sh` adds co-founders to entities
- Keep scripts under 300 lines. Extract shared functions to sourced files
