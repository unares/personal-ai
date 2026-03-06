---

# ═══ STANDARD — Personal AI ═══

## Context Hygiene
- Run /compact when approaching 70% context usage
- Use subagents for research-heavy tasks to protect main context
- Run /handoff to save state before ending a long session

## Vault Convention
- /vault/ contains entity knowledge (if mounted)
- /vault/Distilled/ has pre-processed summaries
- /vault/Raw/ is the drop zone for incoming notes
- NORTHSTAR.md is the entity's long-term vision — read it first

## Rules
- Do One Thing. Earn Full Autonomy.
- Never invent requirements — work from explicit instructions only
- Commit often with clear, descriptive messages
- Log significant decisions with ISO timestamps

## Profile Info
- To switch profiles: exit and relaunch with ./claude.sh
- To inspect a profile: ./claude.sh --inspect <name>
- To add a profile: ./claude.sh --add
- Profiles cannot be switched mid-session (CLAUDE.md is loaded at start)
