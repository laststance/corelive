#!/usr/bin/env bash
# Fails when `src/db/schema.ts` differs from the committed migrations in `drizzle/`.
#
# Run by `.github/workflows/test.yml` (every push and PR) and `.github/workflows/db-migrate.yml` (before the
# production deploy): a schema change pushed without `pnpm db:generate` would otherwise apply nothing and let
# the app ship code that expects a column the database does not have. `drizzle-kit check` cannot see it: it
# compares the migration folder with itself, not with the schema file.
#
# `drizzle-kit generate` works offline. Two failure shapes are caught:
#   1. it writes a new migration                       -> `git status` shows a change under drizzle/
#   2. it cannot tell what changed and writes nothing  -> a column or table RENAME makes it ask an interactive
#      question; with no TTY the question rejects, drizzle-kit only logs the error and still exits 0
# so success is accepted only when drizzle-kit itself says there is nothing to migrate.
#
# Meant for a throw-away CI checkout: when drift exists it leaves the generated migration in `drizzle/`.
set -uo pipefail

output=$(pnpm exec drizzle-kit generate --name=drift_check </dev/null 2>&1)
status=$?
printf '%s\n' "$output"

if [ "$status" -ne 0 ] ||
  [ -n "$(git status --porcelain drizzle)" ] ||
  ! grep -q 'No schema changes, nothing to migrate' <<<"$output"; then
  echo "::error::src/db/schema.ts differs from the committed migrations (or drizzle-kit could not tell, as it cannot for a rename without a terminal). Run 'pnpm db:generate' and commit the new SQL."
  git status --porcelain drizzle
  exit 1
fi
