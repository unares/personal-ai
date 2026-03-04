FROM node:20-alpine

# System dependencies (no docker-cli — Clark cannot spawn containers)
RUN apk add --no-cache bash git

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Clone NanoClaw (orchestrator for WhatsApp channel)
WORKDIR /opt/nanoclaw
RUN git clone --depth 1 https://github.com/qwibitai/nanoclaw.git . && \
    npm ci --production && \
    npm run build 2>/dev/null || true

# Create directory structure
RUN mkdir -p /root/.claude /vault \
    /opt/nanoclaw/groups/main \
    /opt/nanoclaw/data

# Clark customizations
COPY settings.json /root/.claude/settings.json
COPY CLAUDE.md /opt/nanoclaw/groups/main/CLAUDE.md
COPY CLAUDE.md /CLAUDE.md

# NanoClaw configuration — Clark cannot spawn containers
ENV ASSISTANT_NAME=Clark
ENV MAX_CONCURRENT_CONTAINERS=0
ENV CONTAINER_TIMEOUT=1800000

WORKDIR /opt/nanoclaw
CMD ["node", "dist/index.js"]
