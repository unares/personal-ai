---

# ═══ STANDARD — Personal AI ═══

## Profile Switching
- To switch profiles: exit and relaunch with ./participate.sh
- Profiles cannot be switched mid-session (CLAUDE.md is loaded at start)

## CLAUDE.md Stack

```
~/.claude/CLAUDE.md              ← profile-level (generic operating rules)
  single source: memory-vault/ai-workspace/Claude/Templates/Profiles/{role}.md
  host:          participate.sh copies from memory-vault/ directly
  container:     participate.sh reads from /vault/ai-workspace/Claude/Templates/Profiles/

personal-ai/CLAUDE.md            ← ai-workspace entity context
  @-imports: NORTHSTAR, GLOSSARY, ARCHITECTURE (memory-vault/ paths)

app-workspaces/{entity}/{app}-app-{stage}/CLAUDE.md  ← stage container context
  template: memory-vault/{entity}/Claude/CLAUDE.md
  @-imports: NORTHSTAR, GLOSSARY, ARCHITECTURE (/vault/ paths, container-relative)
```

Launch restrictions:
- technical:     allowed from personal-ai/ or app-workspaces/
- non-technical: allowed from app-workspaces/ only (enforced in participate.sh)
- container:     profile template read from /vault/ai-workspace/Templates/Claude/

## Required in every profile's settings.json
Every profile settings.json must include:
```json
"claudeMdExcludes": ["**/services/nanoclaw-paw/**"]
```
This prevents NanoClaw-PAW's own CLAUDE.md from loading when working on PAW files
in the personal-ai workspace. NanoClaw is a git subtree at services/nanoclaw-paw/
and has its own .claude/ context intended for NanoClaw operators, not workspace builders.

## NanoClaw skills in /context — known limitation

NanoClaw skills (add-telegram, setup, customize, etc.) appear in `/context` output
because Claude Code auto-discovers `.claude/skills/` in all subdirectories (monorepo
feature). There is no `skillsExcludes` setting to suppress this.

**This is safe:** discovered skills ≠ available skills. Only skills listed in Claude's
system-reminder (injected at session start) can be invoked via the Skill tool. NanoClaw
skills are never in the system-reminder for workspace sessions — they are display noise
only and cannot be called by Claude accidentally.

**Human risk:** typing `/setup` or `/add-telegram` in the terminal will execute the
NanoClaw skill since Claude Code resolves it from disk. Avoid this in workspace sessions.
