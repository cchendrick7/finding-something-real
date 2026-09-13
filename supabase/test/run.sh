#!/usr/bin/env bash
# Full database security suite. Requires a throwaway Postgres.
#   ./supabase/test/run.sh [host] [port] [user]
set -euo pipefail
H="${1:-127.0.0.1}"; P="${2:-5433}"; U="${3:-postgres}"
DB="fsr_verify_$$"
psql -h "$H" -p "$P" -U "$U" -q -c "create database $DB"
trap 'psql -h "$H" -p "$P" -U "$U" -q -c "drop database if exists $DB"' EXIT
cd "$(dirname "$0")/../.."
for f in supabase/test/00_shim.sql supabase/migrations/*.sql supabase/test/10_seed.sql; do
  psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
FAILED=0
for suite in 20_attack 30_regression; do
  OUT=$(psql -h "$H" -p "$P" -U "$U" -d "$DB" -f "supabase/test/$suite.sql" 2>&1)
  echo "$OUT" | grep -E '^(FAIL)' && FAILED=1 || true
  echo "$suite: $(echo "$OUT" | grep -c '^PASS') passed, $(echo "$OUT" | grep -c '^FAIL') failed"
done
[ "$FAILED" -eq 0 ] && echo "ALL SECURITY TESTS PASSED" || { echo "FAILURES PRESENT"; exit 1; }
