FROM node:20-alpine

LABEL com.personal-ai.role="app-builder"

RUN apk add --no-cache bash git
RUN npm install -g @anthropic-ai/claude-code
RUN mkdir -p /root/.claude /workspace
COPY settings.json /root/.claude/settings.json
COPY git-credential-pat /usr/local/bin/git-credential-pat
RUN chmod +x /usr/local/bin/git-credential-pat
RUN git config --global credential.helper '/usr/local/bin/git-credential-pat'
WORKDIR /workspace
CMD ["sleep", "infinity"]
