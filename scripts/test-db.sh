#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres database and runs the
# permission tests. Needs a local Postgres (PGHOST/PGPORT/PGUSER as usual).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="snap_platform_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/local-stub.sql
for f in supabase/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/permissions.sql 2>&1 | grep -E "NOTICE|ERROR|FAIL" | sed 's/^psql:[^ ]* //'
