# Memory Vault — Directory Layout Spec

> Canonical reference for the memory-vault directory structure.

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
  Bin/                     # Soft-delete (auto-purge after 30 days)
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
