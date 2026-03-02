FROM node:20-alpine
RUN apk add --no-cache bash docker-cli
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
