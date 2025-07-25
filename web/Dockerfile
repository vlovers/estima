# Stage 1: Build the React Application
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Copy package.json and yarn.lock from the root
COPY package.json yarn.lock ./

# Install all dependencies
RUN yarn install --frozen-lockfile

# Copy the entire monorepo source code
COPY . .

# Build the 'web' application for production
RUN npx nx build web --prod

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine

# Copy the built static files from the 'build' stage
COPY --from=build /usr/src/app/dist/web /usr/share/nginx/html

# Copy the nginx config file
# We will create this file next
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
