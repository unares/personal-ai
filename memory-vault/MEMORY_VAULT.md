# Memory Vault — Directory Layout Spec

> Do One Thing. Earn Full Autonomy.

The vault is the structured memory layer of Personal AI. Every piece of knowledge flows through it: humans write to Raw/, Context Extractor distills to Distilled/, agents read what they need.

## Layout

```
memory-vault/{entity}/
  Raw/
    {owner-name}/          # Human-owned input
      Sessions/            # Claude Code session logs
      Submissions/         # Manual submissions
      HITLs/               # Human-in-the-loop decisions
      Coding/              # Code-related notes
    AIOO/                  # AIOO-generated raw content
    Apps/                  # App-specific raw content
    Daily/                 # Daily notes
    People/                # Notes about people
    Other/                 # Uncategorized input
  Memories/                # Context Extractor formed memories
  Distilled/
    Clark/                 # Summaries for Clark consumption
    AIOO/                  # Summaries for AIOO consumption
    specification/         # Technical specs and architecture docs
    shared-story/          # Cross-agent shared narrative
    Archive/               # Retired distilled content
  Claude/                  # Claude Code session context for this entity
    CLAUDE.md              # Project CLAUDE.md for stage container sessions
  Bin/                     # Soft-delete (auto-purge after 180 days)
  Logs/                    # Per-entity activity logs
  {ENTITY}_NORTHSTAR.md    # Long-term vision (human-owned)
  {ENTITY}_GLOSSARY.md     # Terminology (human-owned)
```

## Shared Files (memory-vault/ root)

These files apply to all entities and are not duplicated per entity:

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | System architecture reference |
| `CHRONICLE.md` | Event system spec |
| `MEMORY_VAULT.md` | This file — vault layout spec |
| `AGENT_WELCOME.md` | Agent onboarding template |
| `MD-CONSTITUTION.md` | .md file conventions |

## Access Matrix

| Agent | Raw/ | Memories/ | Distilled/ | Bin/ | Logs/ | NORTHSTAR |
|-------|------|-----------|------------|------|-------|-----------|
| Context Extractor | RW | RW | RW | RW | RW | R |
| AIOO | RW | R | RW | R | RW | R |
| Clark | - | - | R (Clark/) | - | R | R |
| Human | W (Raw/) | - | R | - | R | RW |

## Conventions

1. **Humans own NORTHSTAR and GLOSSARY** — only humans may edit these files. Agents read but never modify.

2. **Context Extractor is the primary Distilled writer** — automated distillation flows through Context Extractor. Claude (technical profile) may also write to Distilled/ directly during setup and development.

3. **Bin auto-purge** — files in Bin/ are automatically deleted after 180 days.

4. **Raw/ is organized by author** — each human gets their own subdirectory with structured sub-folders. Agent-generated raw content goes into Raw/AIOO/.

5. **Logs are append-only** — log files are never truncated or overwritten.

---

## Scope
Defines the directory structure and access rules for the memory-vault. Does NOT define distillation logic (see Context Extractor) or event logging (see CHRONICLE.md).

## Interfaces
- **Read by**: All agents (scoped per access matrix), setup scripts
- **Written by**: Human (system architect), updated as vault structure evolves
- **Depends on**: Context Extractor (implements the structure), setup/add-entity.sh (creates it)

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial spec with access matrix | System |
| 2026-03-04 | v0.4: Added constitution pattern, gamification hooks, 180-day purge | System |
| 2026-03-09 | Removed Processing/, fixed Distilled/ subdirs, added Memories/ and Templates/Claude/, fixed Raw/ structure, removed App Builder, fixed install.sh ref, added shared files table | Michal |
