# Personal AI – mvp-sandbox Constitution v0.1

## Sandbox Purpose & Scope (MVP Sandbox)
This is a focused MVP Sandbox for building one thing at a time.  
- Can be used directly by human founder (normal Mac Terminal).  
- Can be called autonomously by Personal AI [project/company]-AIOO Agent (NanoClaw) for coding tasks.  
- Scope: ship MVPs fast. Never bloat. Do One Thing.

## Full .md Stack (always loaded)
- CLAUDE.md (this – rules + constitution)
- MVP_SANDBOX_GUIDE.md (high-level purpose)
- NEXT_THING.md (near-term features – consult always, keep ≤8 items, newest on top)
- CHRONICLE.md (brain-dump → blog/narrative pipeline)
- PARKING_LOT.md (long-term ideas – EXCLUDE from context unless explicitly asked)
- CONTEXT_STACK.md (quick reference)
- SANDBOX_FACTORY.md (factory rules)

## Context Rules
- Default context = CLAUDE.md + NEXT_THING.md + CHRONICLE.md + MVP_SANDBOX_GUIDE.md
- Never include PARKING_LOT.md unless user or command says “/parkinglot”
- Keep NEXT_THING.md short. When >8 items: auto-retire oldest to PARKING_LOT.md and reshuffle (newest on top).

## Custom Commands (use these in any prompt)
- /nextthing add: <idea> → append to top of NEXT_THING.md
- /nextthing prioritize → reorder + suggest what to do next
- /parking add: <idea> → append to PARKING_LOT.md
- /parking retire oldest → move oldest from NEXT_THING to Parking Lot

## Memory
Use claude-mem plugin for persistent memory across sessions.

Do One Thing. Keep clean. Ship MVPs.
