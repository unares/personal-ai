# Discord Channel — Additional Communication Channel

> Do One Thing. Earn Full Autonomy.

## Overview

Discord can be added as an additional communication channel for NanoClaw agents alongside WhatsApp. NanoClaw supports multiple channels simultaneously.

## Setup

### 1. Create Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application → name it after your agent (e.g., "AIOO")
3. Bot → Add Bot → copy token
4. OAuth2 → URL Generator → select `bot` scope + `Send Messages`, `Read Message History` permissions
5. Use generated URL to invite bot to your server

### 2. Configure NanoClaw

Add Discord channel configuration to the NanoClaw group:

```json
{
  "channels": {
    "discord": {
      "token": "your-bot-token",
      "guild_id": "your-server-id",
      "channel_id": "your-channel-id"
    }
  }
}
```

### 3. Environment Variables

Add to `.env`:
```
DISCORD_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-server-id
DISCORD_CHANNEL_ID=your-channel-id
```

### 4. Update Launcher Script

Add Discord env vars to the `docker run` command in aioo.sh or clark.sh:
```bash
-e "DISCORD_TOKEN=${DISCORD_TOKEN:-}"
-e "DISCORD_GUILD_ID=${DISCORD_GUILD_ID:-}"
-e "DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID:-}"
```

## Channel Behavior

- Messages in the configured Discord channel are routed to the NanoClaw agent
- Agent responses are sent back to the same channel
- Multiple channels (WhatsApp + Discord) can be active simultaneously
- Each channel gets the same agent behavior and skills

---

## Mission Alignment
Multiple communication channels increase accessibility and resilience. If WhatsApp is down, Discord provides an alternative. More channels = more ways for the human to interact = more opportunities for the system to demonstrate value.

## Scope
Defines Discord channel setup for NanoClaw agents. Does NOT define NanoClaw channel internals or Discord bot programming.

## Interfaces
- **Read by**: Humans (setting up Discord)
- **Written by**: Human (system architect)
- **Depends on**: NanoClaw (channel support), Discord API, bot token

## Outcomes
- Discord available as alternative/additional channel
- Same agent behavior across all channels
- Increased system resilience and accessibility

## Gamification Hooks
- [ ] Channel diversity: number of active channels → accessibility score
- [ ] Cross-channel consistency: response quality parity across channels → reliability

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial Discord channel setup guide | System |
