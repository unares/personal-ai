---
paths:
  - "memory-vault/**"
---

# Vault Rules

- Vault is organized per entity: `memory-vault/{entity}/`
- Each entity has: `{ENTITY}_NORTHSTAR.md`, `{ENTITY}_GLOSSARY.md`
- Standard subdirectories: Raw/, Memories/, Distilled/, Logs/, Bin/, Claude/
- Claude/ holds Claude Code session context: project CLAUDE.md for stage containers
- NORTHSTAR files are human-owned — agents read but never modify
- GLOSSARY files are human-owned — Claude suggests, human decides
- Raw/ receives input (sessions, submissions, external sources)
- Memories/ holds Context Extractor formed memories
- Distilled/ holds refined, classified knowledge
- Logs/ holds activity logs and chronicle events (append-only)
- Bin/ holds processed/archived raw files
- Knowledge docs (.md) live in vault, not in project root
- Never store code or config in the vault — that goes in project/
