#!/bin/bash
# Verify /health and /readyz report dependency FAILURE correctly.
#
# Safety: the real Postgres and Redis are never stopped. Instead we boot extra
# throwaway instances of the same production artifact with DATABASE_URL /
# REDIS_URL pointed at dead loopback ports. Nothing shared is mutated.
set -u
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
ok()  { printf '  [PASS] %-40s %s\n' "$1" "${2:-}"; PASS=$((PASS+1)); }
bad() { printf '  [FAIL] %-40s %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }

set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

start_instance() { # start_instance <port> <VAR_TO_BREAK>
  local port="$1" broken="$2"
  local dburl="$DATABASE_URL" rdurl="$REDIS_URL"
  case "$broken" in
    # Dead ports on loopback: connection refused, exactly like a down service.
    postgres) dburl="postgresql://nobody:nobody@127.0.0.1:59999/nonexistent" ;;
    redis)    rdurl="redis://127.0.0.1:59998" ;;
  esac
  # NOTE: record the NODE pid, not the subshell's. `( ... & echo $! )` inside a
  # subshell reports the backgrounded job of that subshell, which exits
  # immediately and leaves the server orphaned on its port.
  ( cd .next/standalone && env \
      NODE_ENV=production PORT="$port" HOSTNAME=127.0.0.1 \
      NODE_OPTIONS="--max-old-space-size=512" \
      DATABASE_URL="$dburl" REDIS_URL="$rdurl" \
      node server.js > "/tmp/cogniflux-fail-$broken.log" 2>&1 ) &
  # Wait for the listener (max 20s), then resolve the real pid from the port.
  for _ in $(seq 1 40); do
    if ss -tlnH "sport = :$port" 2>/dev/null | grep -q LISTEN; then
      ss -tlnpH "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 > "/tmp/cf-fail-$broken.pid"
      return 0
    fi
    sleep 0.5
  done
  return 1
}

stop_instance() { # stop_instance <broken>
  local f="/tmp/cf-fail-$1.pid"
  if [ -f "$f" ]; then
    local pid; pid=$(cat "$f")
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
    # Confirm it actually died; escalate once if not.
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
  fi
  rm -f "$f"
  sleep 1
}

json() { curl -s --max-time 15 "$1" 2>/dev/null; }
scode() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null || echo 000; }

echo "== health failure-injection $(date -u +%FT%TZ) =="
echo "(real Postgres/Redis untouched; throwaway instances get dead dependency ports)"

echo
echo "--- REDIS down (expect: /health 200 degraded, /readyz 503) ---"
if start_instance 3102 redis; then
  B="http://127.0.0.1:3102"
  c=$(scode "$B/health"); body=$(json "$B/health")
  [ "$c" = "200" ] && ok "/health still 200 (degrades open)" "HTTP $c" || bad "/health still 200" "got $c"
  printf '%s' "$body" | grep -q '"status":"degraded"' && ok "/health status=degraded" || bad "/health status=degraded" "$(printf '%s' "$body" | head -c 120)"
  printf '%s' "$body" | grep -q '"redis":{"up":false' && ok "/health reports redis up=false" || bad "/health reports redis up=false"
  printf '%s' "$body" | grep -q '"postgres":{"up":true' && ok "/health reports postgres up=true" || bad "/health reports postgres up=true"
  c=$(scode "$B/readyz"); rbody=$(json "$B/readyz")
  [ "$c" = "503" ] && ok "/readyz 503 (not ready for traffic)" "HTTP $c" || bad "/readyz 503" "got $c"
  printf '%s' "$rbody" | grep -q '"ready":false' && ok "/readyz ready=false" || bad "/readyz ready=false"
  printf '%s' "$rbody" | grep -q '"notReady":\["redis"\]' && ok "/readyz names redis as notReady" || bad "/readyz names redis" "$(printf '%s' "$rbody" | head -c 140)"
  # The app must still serve real traffic with Redis down (cache degrades open).
  c=$(scode "$B/api/search?q=climate&perPage=2")
  [ "$c" = "200" ] && ok "search still works with Redis down" "HTTP $c" || bad "search with Redis down" "got $c"
  stop_instance redis
else
  bad "start instance with Redis broken" "never listened on :3102"; stop_instance redis
fi

echo
echo "--- POSTGRES down (expect: /health 503, /readyz 503) ---"
if start_instance 3103 postgres; then
  B="http://127.0.0.1:3103"
  c=$(scode "$B/health"); body=$(json "$B/health")
  [ "$c" = "503" ] && ok "/health 503 (app unusable)" "HTTP $c" || bad "/health 503" "got $c"
  printf '%s' "$body" | grep -q '"postgres":{"up":false' && ok "/health reports postgres up=false" || bad "/health reports postgres up=false" "$(printf '%s' "$body" | head -c 120)"
  c=$(scode "$B/readyz"); rbody=$(json "$B/readyz")
  [ "$c" = "503" ] && ok "/readyz 503" "HTTP $c" || bad "/readyz 503" "got $c"
  printf '%s' "$rbody" | grep -q 'postgres' && ok "/readyz names postgres as notReady" || bad "/readyz names postgres"
  # Public search does not touch Postgres, so it must still answer.
  c=$(scode "$B/api/search?q=climate&perPage=2")
  [ "$c" = "200" ] && ok "search unaffected by Postgres outage" "HTTP $c" || bad "search with Postgres down" "got $c"
  stop_instance postgres
else
  bad "start instance with Postgres broken" "never listened on :3103"; stop_instance postgres
fi

echo
echo "--- no secrets in failure logs ---"
leak=0
for f in /tmp/cogniflux-fail-redis.log /tmp/cogniflux-fail-postgres.log; do
  [ -f "$f" ] || continue
  PGPASS=$(printf '%s' "${DATABASE_URL:-}" | sed -n 's|^[^:]*://[^:]*:\([^@]*\)@.*|\1|p')
  if [ -n "$PGPASS" ] && grep -qF -- "$PGPASS" "$f" 2>/dev/null; then
    echo "  [FAIL] real DB password appears in $f"; leak=1
  fi
done
[ "$leak" -eq 0 ] && ok "no real credentials in failure logs" || FAIL=$((FAIL+1))

echo
echo "== Summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAIL"
