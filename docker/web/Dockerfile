# syntax=docker/dockerfile:1

# Cursive's browser build (pnpm build:web), served at /cursive by Caddy.
# CI pushes this image to ghcr.io; the services' Compose stack runs it behind
# its own Caddy, on the account app's origin. Build from the repository root:
#   docker build -f apps/cursive/docker/web/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace package Cursive depends on, dev tools included, needs its manifest here.
COPY packages/tsconfig packages/tsconfig
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/editor/package.json packages/editor/
COPY apps/cursive/package.json apps/cursive/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @scholarkit/cursive...
COPY packages/editor packages/editor
COPY apps/cursive apps/cursive
RUN pnpm --filter @scholarkit/cursive build:web

FROM caddy:2-alpine
COPY apps/cursive/docker/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/cursive/dist-web /srv/cursive
EXPOSE 80
