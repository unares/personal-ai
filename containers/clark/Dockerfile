# Clark — Lean Clarity Architect Container
# Spawned by NanoClaw-PAW clark-handler. No embedded NanoClaw.
# Air-gapped from entity networks (clark-net only).

FROM node:20-alpine

# System dependencies (no docker-cli — Clark cannot spawn containers)
RUN apk add --no-cache bash git

# Create non-root user
RUN addgroup -S clark && adduser -S clark -G clark -h /home/clark

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create vault mount point
RUN mkdir -p /home/clark/.claude /vault \
    && chown -R clark:clark /home/clark /vault

# Clark identity + settings (mounted at runtime by clark-handler.ts,
# but baked-in as defaults for standalone testing)
COPY settings.json /home/clark/.claude/settings.json
COPY CLAUDE.md /home/clark/.claude/CLAUDE.md
RUN chown -R clark:clark /home/clark/.claude

# Entrypoint keeps container alive for Claude CLI access
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV HOME=/home/clark
USER clark
WORKDIR /home/clark

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
