FROM node:20-alpine

RUN apk add --no-cache bash

WORKDIR /app
COPY package.json ./
COPY src/ ./src/
COPY entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
