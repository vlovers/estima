# Bun for dependency installation, build and application runtime.
FROM oven/bun:1.3.2-alpine AS deps
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.2-alpine AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN bun run build:api

FROM oven/bun:1.3.2-alpine AS production
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/dist/api ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./
EXPOSE 3000
CMD ["bun", "main.js"]
