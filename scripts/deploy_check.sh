#!/bin/bash
# Cogniflux pre-deploy gate — READ ONLY.
# Runs typecheck + tests + infra readiness + health probe; prints a PASS/FAIL summary.
# Performs NO destructive steps and never builds (npm run build must NOT run while
# the dev server holds .next/ — see docs/DEPLOYMENT.md).
set -u

cd "$(dirname "$0")/.."

APP_URL="${APP_URL:-http://localhost:3100}"
declare -a NAMES=() RESULTS=()
PASS=0; FAIL=0

record() { # record <name> <ok:0|1> <detail>
  NAMES+=("$1"); RESULTS+=("$2"); [ "$2" -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  printf '  [%s] %-22s %s\n' "$([ "$2" -eq 0 ] && echo PASS || echo FAIL)" "$1" "$3"
}

echo "== Cogniflux deploy check ($(date -u +%FT%TZ)) =="

# 1. Typecheck
if out=$(npx tsc --noEmit 2>&1); then
  record "typecheck" 0 "tsc --noEmit clean"
else
  record "typecheck" 1 "$(echo "$out" | head -5 | tr '\n' ' ')"
fi

# 2. Tests (full suite)
if out=$(npx jest --silent 2>&1); then
  summary=$(echo "$out" | grep -Eo '[0-9]+ passed(, [0-9]+ skipped)?' | tail -1)
  record "jest" 0 "${summary:-all suites passed}"
else
  summary=$(echo "$out" | grep -E '[0-9]+ failed|[0-9]+ passed' | tail -3)
  record "jest" 1 "${summary:-see jest output}"
fi

# 3. PostgreSQL readiness
if pg_isready -q; then
  record "postgres" 0 "pg_isready OK"
else
  record "postgres" 1 "pg_isready failed (is PG running locally?)"
fi

# 4. Redis readiness
if redis-cli ping 2>/dev/null | grep -qi PONG; then
  record "redis" 0 "PING -> PONG"
else
  record "redis" 1 "redis-cli ping failed (is Redis running locally?)"
fi

# 5. App health endpoint (may legitimately fail until /api/health lands)
code=$(curl -s -o /tmp/cogniflux_health.$$ -w '%{http_code}' --max-time 5 "$APP_URL/api/health" 2>/dev/null || echo 000)
body=$(tr -d '\n' < "/tmp/cogniflux_health.$$" 2>/dev/null | head -c 120); rm -f "/tmp/cogniflux_health.$$"
case "$code" in
  200) record "api/health" 0 "HTTP $code ${body:+— }$body" ;;
  000) record "api/health" 1 "no response at $APP_URL (app running? /api/health exists yet?)" ;;
  *)   record "api/health" 1 "HTTP $code ${body:+— }$body" ;;
esac

echo "== Summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAIL"
