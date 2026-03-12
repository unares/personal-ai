# App Dev Stage — Agent Workspace Container
# Spawned by NanoClaw-PAW stage-handler via docker compose profiles.
# Agents run inside via: docker exec {container} claude ...

FROM node:20-alpine

ARG STAGE=demo

# System dependencies
RUN apk add --no-cache bash git curl

# Create non-root user
RUN addgroup -S agent && adduser -S agent -G agent -h /home/agent

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create mount points
RUN mkdir -p /home/agent/.claude /vault /workspace \
    && chown -R agent:agent /home/agent /vault /workspace

# Agent identity
COPY CLAUDE.md /home/agent/.claude/CLAUDE.md
RUN chown -R agent:agent /home/agent/.claude

# Entrypoint keeps container alive + writes health heartbeat
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV HOME=/home/agent
ENV STAGE=${STAGE}
USER agent
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
