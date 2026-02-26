FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g serve
CMD ["sh", "-c", "sh DevSandbox-Template/first-run-wizard.sh && serve -s . -l 3000"]
