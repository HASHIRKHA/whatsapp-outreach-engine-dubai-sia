#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."

# pnpm may keep the prisma CLI in the package's local node_modules or hoist it
# to the workspace root depending on version and .npmrc. Check both.
PRISMA_BIN="node_modules/.bin/prisma"
if [ ! -f "$PRISMA_BIN" ]; then
  PRISMA_BIN="../../node_modules/.bin/prisma"
fi

if [ ! -f "$PRISMA_BIN" ]; then
  echo "[startup] ERROR: prisma CLI not found at node_modules/.bin/prisma or ../../node_modules/.bin/prisma"
  exit 1
fi

"$PRISMA_BIN" migrate deploy

echo "[startup] Migrations complete. Starting NestJS API..."
exec node dist/main
