FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache build-base python3
RUN npm ci --production
COPY *.js ./
COPY config.json ./
EXPOSE 27125
CMD ["node", "content-loader.js"]
