# Stage 1: Development Dependencies
FROM node:20-alpine AS deps
WORKDIR /usr/src/app

# Copy package.json and yarn.lock from the root
COPY package.json yarn.lock ./

# Install all dependencies
RUN yarn install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Copy dependencies from the 'deps' stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy the entire monorepo source code
COPY . .

# Build the 'api' application
RUN npx nx build api --prod

# Stage 3: Production
FROM node:20-alpine AS production

# Set environment variable
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy the built application and production dependencies
COPY --from=builder /usr/src/app/dist/api .
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "main.js"]
