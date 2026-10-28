#!/bin/sh
# Container entrypoint: apply migrations (idempotent), optionally seed, start the API.
set -e

pnpm exec tsx src/db/migrate.ts

if [ "${DEVDIGEST_SEED:-true}" = "true" ]; then
  pnpm exec tsx src/db/seed.ts
fi

exec pnpm exec tsx src/server.ts
