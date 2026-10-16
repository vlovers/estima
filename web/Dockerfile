FROM node:24-bookworm-slim AS build
COPY --from=oven/bun:1.3.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN node scripts/verify-native-dependencies.cjs
RUN bun run build:web

FROM nginx:stable-alpine
COPY --from=build /usr/src/app/dist/web /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
