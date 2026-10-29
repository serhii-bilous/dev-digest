# DevDigest API. Build from the repo root:
#   docker build -f server/Dockerfile .
# The API imports reviewer-core as raw TypeScript (tsconfig path alias), so it
# runs under tsx instead of a compiled dist/ — same as `pnpm dev`, minus watch.
FROM node:22-bookworm-slim

# git: cloning/fetching PR repos (simple-git). ca-certificates: HTTPS to GitHub/LLMs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Local Claude provider shells out to the `claude` CLI. Pinned version; optional
# deps must stay (the native binary arrives through them). Installed as root
# before any USER switch. Autoupdater off so the pinned version stays put.
RUN npm install -g @anthropic-ai/claude-code@2.1.296
ENV DISABLE_AUTOUPDATER=1

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

# reviewer-core uses npm; only its runtime deps are needed.
COPY reviewer-core/package.json reviewer-core/package-lock.json reviewer-core/
RUN cd reviewer-core && npm ci --omit=dev --no-audit --no-fund

# server uses pnpm; dev deps stay because tsx runs the app.
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml server/
RUN cd server && pnpm install --frozen-lockfile

COPY reviewer-core/ reviewer-core/
COPY server/ server/
RUN chmod +x server/docker-entrypoint.sh

WORKDIR /app/server
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
