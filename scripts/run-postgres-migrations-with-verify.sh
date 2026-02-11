#!/usr/bin/env bash
# Run Postgres migrations and verify tables.
# Requires DATABASE_URL in .env or environment (Postgres URL from Railway or similar).
#
# Get DATABASE_URL from Railway:
#   Project → your service → Variables, or Connect → Postgres → "Postgres connection URL"
# Then: echo "DATABASE_URL=postgresql://..." >> .env
# Or run: DATABASE_URL='postgresql://...' ./scripts/run-postgres-migrations-with-verify.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ] && [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" != postgres* ]]; then
  echo "⚠️  DATABASE_URL is not set or not a Postgres URL."
  echo ""
  echo "To run migrations against Railway Postgres:"
  echo "  1. Railway Dashboard → your project → Variables (or Connect → Postgres)"
  echo "  2. Copy the Postgres connection URL (DATABASE_URL)"
  echo "  3. In this repo: echo 'DATABASE_URL=postgresql://...' >> .env"
  echo "  4. Run: npm run db:migrate:postgres"
  echo ""
  echo "Or in one line:"
  echo "  DATABASE_URL='postgresql://user:pass@host:port/railway' npm run db:migrate:postgres"
  exit 1
fi

echo "Running Postgres migrations..."
npm run db:migrate:postgres
echo ""
echo "Done. Tables listed above."
