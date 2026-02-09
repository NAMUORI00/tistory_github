# ── Build ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime ──
FROM node:20-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY src/ ./src/

# .env는 docker run -e 또는 --env-file로 주입
ENV PORT=3000
ENV TARGET_BLOG_URL=notice

EXPOSE 3000

CMD ["node", "server/dev-server.mjs"]
