# Memory Vault — Directory Layout Spec

> Do One Thing. Earn Full Autonomy.

The vault is the structured memory layer of Personal AI. Every piece of knowledge flows through it: humans write to Raw/, Context Extractor distills to Distilled/, agents read what they need.

## Layout

```
memory-vault/{entity}/
  Raw/
    {owner-name}/          # Human-owned input
      Clark/               # Notes from Clark sessions
      Submissions/         # Manual submissions
      HITLs/               # Human-in-the-loop decisions
      Coding/              # Code-related notes
    AIOO/                  # AIOO-generated raw content
    Clark/                 # Clark-generated raw content
    Other/                 # Uncategorized input
  Processing/              # Transient — Context Extractor working queue
  Distilled/
    Clark/                 # Summaries for Clark consumption
    AIOO/                  # Summaries for AIOO consumption
    {owner-name}/          # Human-specific distilled content
    shared/                # Cross-agent shared summaries
    personal-story/        # Personal narrative content
    Archive/               # Retired distilled content
  Bin/                     # Soft-delete (auto-purge after 180 days)
  Logs/                    # Per-entity activity logs
  {ENTITY}_NORTHSTAR.md    # Long-term vision (human-owned)
```

## Access Matrix

| Agent | Raw/ | Processing/ | Distilled/ | Bin/ | Logs/ | NORTHSTAR |
|-------|------|-------------|------------|------|-------|-----------|
| Context Extractor | RW | RW | RW | RW | RW | R |
| AIOO | RW | R | RW | R | RW | R |
| Clark | - | - | R (Clark/) | - | R | R |
| App Builder | - | - | R (scoped) | - | R | R |
| Human | W (Raw/) | - | R | - | R | RW |

## Conventions

1. **Humans own NORTHSTAR** — only humans may edit `{ENTITY}_NORTHSTAR.md`.
   Agents read it but never modify it.

2. **Context Extractor is the sole Distilled writer** — no other agent writes
   to Distilled/ directly. All content flows through the Context Extractor
   pipeline (ingest → classify → distill).

3. **Bin auto-purge** — files in Bin/ are automatically deleted after 180 days.
   This is a soft-delete mechanism; files can be recovered within that window.

4. **Processing is transient** — files in Processing/ are intermediate state.
   They should not persist longer than a few seconds under normal operation.

5. **Raw/ is organized by author** — each human gets their own subdirectory
   under Raw/ with structured sub-folders. Agent-generated raw content goes
   into Raw/AIOO/ or Raw/Clark/.

6. **Logs are append-only** — log files are never truncated or overwritten.
   Each entity has its own log directory.

---

## Mission Alignment
Structured knowledge enables focused execution. When agents read pre-distilled, conflict-checked content instead of raw notes, they spend less time understanding and more time doing the One Thing.

## Scope
Defines the directory structure and access rules for the memory-vault. Does NOT define distillation logic (see Context Extractor) or event logging (see CHRONICLE.md).

## Interfaces
- **Read by**: All agents (scoped per access matrix), setup scripts, verify script
- **Written by**: Human (system architect), updated as vault structure evolves
- **Depends on**: Context Extractor (implements the structure), setup/install.sh (creates it)

## Outcomes
- Every agent knows exactly where to find its context
- Access control is enforced by Docker volume mounts matching this matrix
- Humans always know where to drop notes (Raw/{name}/Submissions/)

## Gamification Hooks
- [ ] Vault health score: ratio of Distilled/ entries to Raw/ entries → higher = better processing
- [ ] Staleness index: age of oldest unprocessed Raw/ file → lower = faster pipeline
- [ ] Coverage: % of Raw/ categories that have corresponding Distilled/ output → 100% = complete
- [ ] Bin utilization: files in Bin/ vs total → low = clean system, high = lots of churn
- [ ] HITL engagement: frequency of entries in Raw/{owner}/HITLs/ → human-in-the-loop learning signal

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial spec with access matrix | System |
| 2026-03-04 | v0.4: Added constitution pattern, gamification hooks, 180-day purge | System |
