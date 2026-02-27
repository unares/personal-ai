FROM node:20-alpine
RUN apk add --no-cache bash git
RUN mkdir -p /usr/local/bin
RUN cat > /usr/local/bin/claude << 'INNER'
#!/bin/bash
echo -e "\033[32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[32m✅ personal-ai-mvp-sandbox (MVP Sandbox)\033[0m"
echo -e "\033[32mNORTHSTAR + SCOPE active | CLAUDE.md auto-loaded\033[0m"
echo ""
echo "Commands: /nextthing add: | /parking add:"
echo -e "\033[32m═══════════════════════════════════════════════════════════════\033[0m"

if [ ! -f ~/.claude-mem-installed ]; then
  echo "→ Installing claude-mem (one-time)..."
  npx @anthropic-ai/claude-code@latest --eval "/plugin marketplace add thedotmack/claude-mem && /plugin install claude-mem" || true
  touch ~/.claude-mem-installed
fi
npx @anthropic-ai/claude-code@latest
INNER
RUN chmod +x /usr/local/bin/claude
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["sleep", "infinity"]
