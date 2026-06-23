FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build -- --target proxy

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8085

USER node

EXPOSE 8085

CMD ["node", "src/server.js"]
