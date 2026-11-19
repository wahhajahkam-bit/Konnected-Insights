#!/bin/bash
set -e
node scripts/source-backup-setup.mjs
pnpm install --frozen-lockfile
# Apply the committed Drizzle schema to development after task merges.
# Replit Publish owns the corresponding production schema diff.
pnpm --filter @workspace/db run push-force
node lib/db/scripts/migrate-future-work.mjs
pnpm --filter @workspace/db migrate:agent-monitoring
