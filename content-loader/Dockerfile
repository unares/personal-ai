FROM node:20-alpine
RUN apk add --no-cache bash
WORKDIR /app/content-loader
COPY package.json .
RUN npm install --production
COPY content-loader.js .
CMD ["node", "content-loader.js"]
