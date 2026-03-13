---

# ═══ STANDARD — Personal AI ═══

## Profile Switching
- To switch profiles: exit and relaunch with ./participate.sh
- Profiles cannot be switched mid-session (CLAUDE.md is loaded at start)

## Required in every profile's settings.json
Every profile settings.json must include:
```json
"claudeMdExcludes": ["**/services/nanoclaw-paw/**"]
```
This prevents NanoClaw-PAW's own CLAUDE.md from loading when working on PAW files
in the personal-ai workspace. NanoClaw is a git subtree at services/nanoclaw-paw/
and has its own .claude/ context intended for NanoClaw operators, not workspace builders.
