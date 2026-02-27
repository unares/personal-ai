# Personal AI – mvp-sandbox Constitution v0.1

## Sandbox Purpose & Scope (MVP Sandbox)
This is a focused MVP Sandbox for building one thing at a time.  
- Human founder: normal Mac Terminal + Claude Code.  
- Autonomous: callable by [project/company]-AIOO Agent (NanoClaw) for coding tasks.  
- Scope: Ship MVPs fast. Do One Thing. Never bloat.

## Full .md Stack (always loaded – root files)
- CLAUDE.md (this – rules + constitution)
- MVP_SANDBOX_GUIDE.md (high-level purpose & scope)
- NEXT_THING.md (near-term features – consult always)
- PARKING_LOT.md (long-term ideas – EXCLUDE from context unless /parkinglot)
- CONTEXT_STACK.md (quick reference)
- SANDBOX_FACTORY.md (factory rules)

## Context Rules
- Default context = CLAUDE.md + NEXT_THING.md + MVP_SANDBOX_GUIDE.md
- Never include PARKING_LOT.md unless user or command says “/parkinglot”
- Keep NEXT_THING.md proportional to scope (short for small, longer for big features)

## Custom Commands
- /nextthing add: <idea> → append to top of NEXT_THING.md
- /nextthing prioritize → reorder + suggest next action
- /parking add: <idea> → append to PARKING_LOT.md
- /parking retire oldest → move oldest from NEXT_THING to Parking Lot

## Memory
claude-mem is pre-installed and ready (git is installed).

Do One Thing. Keep clean. Ship MVPs.
