FROM node:20-alpine

# System dependencies (docker-cli for spawning nested App Builder containers)
RUN apk add --no-cache bash git docker-cli

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Clone NanoClaw (orchestrator for WhatsApp + container spawning)
WORKDIR /opt/nanoclaw
RUN git clone --depth 1 --branch v1.2.0 https://github.com/qwibitai/nanoclaw.git . && \
    npm ci && \
    npm run build && \
    npm prune --production

# Create directory structure
RUN mkdir -p /root/.claude /vault /workspace \
    /opt/nanoclaw/groups/main \
    /opt/nanoclaw/data

# Personal AI customizations
COPY settings.json /root/.claude/settings.json
COPY CLAUDE.md /opt/nanoclaw/groups/main/CLAUDE.md
COPY CLAUDE.md /CLAUDE.md

# NanoClaw configuration
ENV ASSISTANT_NAME=AIOO
ENV MAX_CONCURRENT_CONTAINERS=3
ENV CONTAINER_TIMEOUT=1800000

WORKDIR /opt/nanoclaw
CMD ["node", "dist/index.js"]
