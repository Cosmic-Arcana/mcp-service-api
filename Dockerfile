# syntax=docker/dockerfile:1.7
# Build and runtime are separated so the published image carries no toolchain, no sources and no
# dev dependencies. Every stage starts from the same pinned base, so one bump moves all of them.
FROM node:22-alpine AS base
WORKDIR /app
# @cosmic-arcana/sdk is installed straight from its repository, which npm can only do with git.
RUN apk add --no-cache git

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]
