FROM node:20-alpine
RUN apk add --no-cache bash git
RUN npm install -g @anthropic-ai/claude-code
RUN mkdir -p /root/.claude /workspace
COPY settings.json /root/.claude/settings.json
WORKDIR /workspace
CMD ["sleep", "infinity"]
