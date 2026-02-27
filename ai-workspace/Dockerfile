FROM node:20-alpine
RUN apk add --no-cache bash git
RUN mkdir -p /usr/local/bin && cat > /usr/local/bin/claude << 'INNER'
#!/bin/bash
echo -e "\033[32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[32m✅ personal-ai-mvp-sandbox (MVP Sandbox)\033[0m"
echo -e "\033[32mCLAUDE.md auto-loaded at root – no /init needed!\033[0m"
echo ""
echo "Custom Commands:"
echo "  /nextthing add: <idea>     /parking add: <idea>"
echo "  Keep NEXT_THING short. claude-mem ready."
echo -e "\033[32m═══════════════════════════════════════════════════════════════\033[0m"
npx @anthropic-ai/claude-code@latest
INNER
RUN chmod +x /usr/local/bin/claude
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["sleep", "infinity"]
