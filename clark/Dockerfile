FROM node:20-alpine

# System dependencies (no docker-cli — Clark cannot spawn containers)
RUN apk add --no-cache bash git su-exec

# Create non-root user (Claude Code refuses --dangerously-skip-permissions as root)
RUN addgroup -S pai && adduser -S pai -G pai -h /home/pai

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Clone NanoClaw (orchestrator for WhatsApp channel)
WORKDIR /opt/nanoclaw
RUN git clone --depth 1 --branch v1.2.0 https://github.com/qwibitai/nanoclaw.git . && \
    npm ci && \
    cp .claude/skills/add-whatsapp/add/src/channels/whatsapp.ts src/channels/whatsapp.ts && \
    cp .claude/skills/add-whatsapp/modify/src/channels/index.ts src/channels/index.ts && \
    npm install @whiskeysockets/baileys && \
    npm run build && \
    npm prune --production

# Create directory structure
RUN mkdir -p /home/pai/.claude /vault \
    /opt/nanoclaw/groups/main \
    /opt/nanoclaw/data && \
    chown -R pai:pai /home/pai /vault /opt/nanoclaw

# Clark customizations
COPY settings.json /home/pai/.claude/settings.json
COPY CLAUDE.md /opt/nanoclaw/groups/main/CLAUDE.md
COPY CLAUDE.md /CLAUDE.md

# Entrypoint with NanoClaw fallback
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chown -R pai:pai /home/pai/.claude && \
    chmod +x /usr/local/bin/entrypoint.sh

# NanoClaw configuration — Clark cannot spawn containers
ENV ASSISTANT_NAME=Clark
ENV MAX_CONCURRENT_CONTAINERS=0
ENV CONTAINER_TIMEOUT=1800000
ENV HOME=/home/pai

WORKDIR /opt/nanoclaw
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
