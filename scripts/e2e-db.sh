#!/usr/bin/env bash
# Starts (or resets) a local Supabase for the end-to-end tests and loads it:
# the first migration, a test company, the other migrations, then the e2e fixtures. The
# company has to exist before the migrations run, because several migrations
# seed settings for every company that exists at the time.
#
# Needs Docker. Images come from Docker Hub (SUPABASE_INTERNAL_IMAGE_REGISTRY).
# Never touches the hosted project: everything points at 127.0.0.1:54322.
set -euo pipefail
cd "$(dirname "$0")/.."
export SUPABASE_INTERNAL_IMAGE_REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-docker.io}"
SB="npx -y supabase@2.122.1"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if $SB status --workdir e2e >/dev/null 2>&1; then
  $SB db reset --workdir e2e --local --no-seed >/dev/null
else
  $SB start --workdir e2e -x studio,imgproxy,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor,mailpit >/dev/null
fi

PSQL="psql -X -q -v ON_ERROR_STOP=1 $DB_URL"
first=1
for f in supabase/migrations/*.sql; do
  $PSQL -f "$f"
  # The first migration creates companies; the company goes in right after it.
  if [ "$first" = 1 ]; then $PSQL -f e2e/fixtures/company.sql; first=0; fi
done
$PSQL -f e2e/fixtures/seed.sql
$PSQL -c "notify pgrst, 'reload schema'"

# The URL and keys the app and the tests use, for a .env file or CI.
$SB status --workdir e2e -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY 2>/dev/null \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' > e2e/.env.e2e
echo "Local Supabase ready; keys in e2e/.env.e2e"
