FROM node:20-alpine

LABEL com.personal-ai.role="app-builder"

RUN apk add --no-cache bash git curl su-exec

# Create non-root user
RUN addgroup -S pai && adduser -S pai -G pai -h /home/pai

RUN npm install -g @anthropic-ai/claude-code
RUN mkdir -p /home/pai/.claude /workspace /vault

COPY settings.json /home/pai/.claude/settings.json
COPY git-credential-pat /usr/local/bin/git-credential-pat
COPY pai-launch /usr/local/bin/pai-launch
COPY ../setup/dev-update /usr/local/bin/dev-update
RUN chmod +x /usr/local/bin/git-credential-pat /usr/local/bin/pai-launch /usr/local/bin/dev-update
RUN git config --global credential.helper '/usr/local/bin/git-credential-pat'
RUN chown -R pai:pai /home/pai /workspace /vault

ENV HOME=/home/pai
WORKDIR /workspace
CMD ["sleep", "infinity"]
