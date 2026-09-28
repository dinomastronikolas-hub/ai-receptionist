#!/usr/bin/env bash
# End-to-end tests against a throwaway Postgres database.
#
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:e2e
#
# Creates database `tandem_e2e`, applies the migration + demo seed, starts the
# test-only Supabase stand-in (tests/e2e/fake-supabase.mjs) on :54321, builds
# and starts the app on :3000, then runs Playwright.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a Postgres server where you can CREATE DATABASE}"
E2E_DB_URL="$(node -e 'const u=new URL(process.env.TEST_DATABASE_URL);u.pathname="/tandem_e2e";console.log(u.toString())')"

psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "drop database if exists tandem_e2e with (force)" -c "create database tandem_e2e"
psql "$E2E_DB_URL" -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/supabase-shim.sql \
  -f supabase/migrations/20260928000000_init.sql \
  -f supabase/seed.sql

DATABASE_URL="$E2E_DB_URL" PORT=54321 node tests/e2e/fake-supabase.mjs > /tmp/tandem-fake-supabase.log 2>&1 &
FAKE_PID=$!
trap 'kill $FAKE_PID ${APP_PID:-} 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf localhost:54321/health >/dev/null && break; sleep 0.5; done

export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(grep ANON_KEY= /tmp/tandem-fake-supabase.log | cut -d= -f2)"
npx next build
PORT=3000 npx next start > /tmp/tandem-app.log 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do curl -sf -o /dev/null localhost:3000/ && break; sleep 0.5; done

npx playwright test "$@"
