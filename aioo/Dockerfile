FROM node:20-alpine

# System dependencies (docker-cli for spawning nested containers)
RUN apk add --no-cache bash git docker-cli su-exec

# Create non-root user (Claude Code refuses --dangerously-skip-permissions as root)
RUN addgroup -S pai && adduser -S pai -G pai -h /home/pai

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Clone NanoClaw (orchestrator for WhatsApp + container spawning)
WORKDIR /opt/nanoclaw
RUN git clone --depth 1 --branch v1.2.0 https://github.com/qwibitai/nanoclaw.git . && \
    npm ci && \
    cp .claude/skills/add-whatsapp/add/src/channels/whatsapp.ts src/channels/whatsapp.ts && \
    cp .claude/skills/add-whatsapp/modify/src/channels/index.ts src/channels/index.ts && \
    npm install @whiskeysockets/baileys && \
    npm run build && \
    npm prune --production

# Create directory structure
RUN mkdir -p /home/pai/.claude /vault /workspace \
    /opt/nanoclaw/groups/main \
    /opt/nanoclaw/data && \
    chown -R pai:pai /home/pai /vault /workspace /opt/nanoclaw

# Personal AI customizations
COPY settings.json /home/pai/.claude/settings.json
COPY CLAUDE.md /opt/nanoclaw/groups/main/CLAUDE.md
COPY CLAUDE.md /CLAUDE.md

# Universal launcher + dev-update + entrypoint
COPY pai-launch /usr/local/bin/pai-launch
COPY ../setup/dev-update /usr/local/bin/dev-update
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chown -R pai:pai /home/pai/.claude && \
    chmod +x /usr/local/bin/pai-launch /usr/local/bin/dev-update /usr/local/bin/entrypoint.sh

# NanoClaw configuration
ENV ASSISTANT_NAME=AIOO
ENV MAX_CONCURRENT_CONTAINERS=3
ENV CONTAINER_TIMEOUT=1800000
ENV HOME=/home/pai

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
