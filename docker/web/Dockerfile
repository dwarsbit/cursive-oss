# syntax=docker/dockerfile:1

# Cursive's browser build (pnpm build:web), served at /cursive by Caddy.
# CI pushes this image to ghcr.io; the services' Compose stack runs it behind
# its own Caddy, on the account app's origin. Build from the repository root:
#   docker build -f apps/cursive/docker/web/Dockerfile .

FROM node:26-alpine AS build
# Node 25 and later ship without Corepack: install the pnpm that package.json names.
RUN --mount=type=bind,source=package.json,target=/tmp/package.json \
  npm install --global "$(node -p "require('/tmp/package.json').packageManager")" \
  && rm -rf /root/.npm
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace package Cursive depends on, dev tools included, needs its manifest here.
COPY packages/tsconfig packages/tsconfig
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/editor/package.json packages/editor/
COPY packages/i18n/package.json packages/i18n/
COPY packages/updates/package.json packages/updates/
COPY packages/account-menu/package.json packages/account-menu/
COPY packages/monitoring/package.json packages/monitoring/
COPY packages/collab/package.json packages/collab/
COPY packages/assistant/package.json packages/assistant/
COPY apps/cursive/package.json apps/cursive/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @scholarkit/cursive...
COPY packages/editor packages/editor
COPY packages/i18n packages/i18n
COPY packages/updates packages/updates
COPY packages/account-menu packages/account-menu
COPY packages/monitoring packages/monitoring
COPY packages/collab packages/collab
COPY packages/assistant packages/assistant
COPY apps/cursive apps/cursive
# Error reports (src/lib/monitoring.ts); without it the build sends none.
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# Source maps go to Sentry when the build gets the sentry_auth_token secret, and stay out of
# the image either way.
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    pnpm --filter @scholarkit/cursive build:web

FROM caddy:2-alpine
COPY apps/cursive/docker/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/cursive/dist-web /srv/cursive
EXPOSE 80
