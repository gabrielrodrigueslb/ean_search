FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

EXPOSE 3000

CMD ["npm", "start"]
