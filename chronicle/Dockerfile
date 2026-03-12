FROM node:22-slim
RUN npm install -g @tobilu/qmd
WORKDIR /app
COPY package.json .
RUN npm install
COPY watcher.js .
ENV XDG_CACHE_HOME=/data
CMD ["sh", "-c", "node watcher.js & qmd mcp --http --port 8181 & wait"]
