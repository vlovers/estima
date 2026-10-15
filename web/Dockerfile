FROM oven/bun:1.3.2-alpine AS build
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:web

FROM nginx:stable-alpine
COPY --from=build /usr/src/app/dist/web /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
