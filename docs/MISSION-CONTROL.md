# Mission Control — Dashboard Specification

> Do One Thing. Earn Full Autonomy.

## Overview

Mission Control is a web dashboard (port 3000) providing visibility into the Personal AI system. It serves as a fallback interface when WhatsApp is unavailable and as an operational monitoring tool.

## Features

### Container Status
- Running containers with name, image, uptime, resource usage
- Start/stop controls for AIOO and Clark
- Container spawn history

### Vault Health
- Per-entity: Raw/ queue depth, Distilled/ coverage, staleness index
- Last distillation timestamp
- Bin/ purge status

### Chronicle Events
- Real-time event stream (last 100 events)
- Filter by entity, agent, event type
- Session timeline visualization

### NORTHSTAR Alignment
- Current northstar summary per entity
- Recent actions mapped to northstar objectives
- Alignment score (% of actions traceable to northstar)

### Routing Trace Stats (when hybrid enabled)
- Model distribution (Gemini vs Claude)
- Cost savings vs all-Claude baseline
- Fallback rate and latency impact
- Last 50 routing decisions

### Gamification Dashboard
- Per-agent autonomy scores
- Trust level progression (Observer → Autonomous)
- Cost efficiency trends
- Action completion rates

## Technical Notes

- Built as a standalone service
- Static frontend + API calls to Context Extractor
- Reads Chronicle events, vault metadata, Docker API
- No authentication initially (localhost only)
- Port 3000

---

## Mission Alignment
Visibility enables trust. Humans need to see what agents are doing to grant more autonomy. Mission Control makes the system's behavior transparent and auditable without requiring WhatsApp interaction.

## Scope
Defines the Mission Control dashboard features and purpose. Does NOT define implementation details.

## Interfaces
- **Read by**: Humans (using the dashboard), AIOO (spawning the builder)
- **Written by**: Human (system architect)
- **Depends on**: Context Extractor API, Chronicle, Docker API, vault filesystem

## Outcomes
- Full system visibility on a single page
- Fallback interface when WhatsApp is down
- Gamification scores visible and motivating
- Operational health at a glance

## Gamification Hooks
- [ ] Dashboard uptime: availability of Mission Control → infrastructure reliability
- [ ] Human engagement: page views, interaction frequency → tool usefulness
- [ ] Alert response time: time from alert to human action → operational responsiveness

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial Mission Control dashboard spec | System |
