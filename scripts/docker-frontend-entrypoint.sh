#!/bin/sh
set -e
cd /app
# Anonymous volume hides image `apps/frontend/node_modules`; reinstall links deps.
# Do NOT bind-mount `pnpm-lock.yaml` from Windows here — pnpm renames the lockfile atomically
# and Docker Desktop returns EBUSY, so install never finishes and Vite never starts.
pnpm install --prefer-offline
cd /app/apps/frontend
exec npm run dev -- --host
