#!/bin/bash
# Production smoke test against a running Cogniflux instance.
# Read-only apart from creating one throwaway account (required to exercise
# authenticated routes). Never prints secrets.
set -u
BASE="${BASE:-http://127.0.0.1:3101}"
J=$(mktemp)
PASS=0; FAIL=0

ok()   { printf '  [PASS] %-34s %s\n' "$1" "${2:-}"; PASS=$((PASS+1)); }
bad()  { printf '  [FAIL] %-34s %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }

# check <label> <expected_code> <actual_code> [detail]
check() { [ "$2" = "$3" ] && ok "$1" "HTTP $3 ${4:-}" || bad "$1" "expected $2, got $3 ${4:-}"; }

# code <curl args...> -> prints status code
code() { curl -s -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 45 "$@" 2>/dev/null || echo 000; }
body() { cat /tmp/smoke_body.$$ 2>/dev/null; }

echo "== production smoke test $(date -u +%FT%TZ) =="
echo "target: $BASE"
echo

echo "--- probes ---"
c=$(code "$BASE/health");  check "/health" 200 "$c" "$(body | head -c 90)"
c=$(code "$BASE/readyz");  check "/readyz" 200 "$c" "$(body | head -c 60)"
c=$(code "$BASE/api/health"); check "/api/health" 200 "$c"
c=$(code "$BASE/api/readyz"); check "/api/readyz" 200 "$c"

# Dependency truth from the probe body itself.
pg=$(code "$BASE/api/health" >/dev/null; body | grep -o '"postgres":{"up":[a-z]*' | grep -o '[a-z]*$')
rd=$(body | grep -o '"redis":{"up":[a-z]*' | grep -o '[a-z]*$')
[ "$pg" = "true" ] && ok "postgres healthy (via probe)" || bad "postgres healthy (via probe)" "up=$pg"
[ "$rd" = "true" ] && ok "redis healthy (via probe)"    || bad "redis healthy (via probe)" "up=$rd"

echo
echo "--- public pages ---"
c=$(code "$BASE/");          check "homepage" 200 "$c"
HOME_BODY=$(body)
c=$(code "$BASE/research");  check "research page" 200 "$c"
c=$(code "$BASE/explore");   check "explore page" 200 "$c"
c=$(code "$BASE/learn");     check "learn page" 200 "$c"
c=$(code "$BASE/login");     check "login page" 200 "$c"

echo
echo "--- content-first homepage (no search performed) ---"
if printf '%s' "$HOME_BODY" | grep -q 'Trending Research'; then ok "homepage Trending section"; else bad "homepage Trending section"; fi
if printf '%s' "$HOME_BODY" | grep -q 'Latest Research'; then ok "homepage Latest section"; else bad "homepage Latest section"; fi
n=$(printf '%s' "$HOME_BODY" | grep -o 'href="/paper/' | wc -l)
[ "$n" -gt 0 ] && ok "homepage paper links present" "count=$n" || bad "homepage paper links present" "count=0 (feed empty)"

echo
echo "--- search APIs ---"
c=$(code "$BASE/api/search?q=machine%20learning&perPage=3"); check "academic search" 200 "$c"
works=$(body | grep -o '"works":\[' | wc -l)
[ "$works" -gt 0 ] && ok "academic search returns works" || bad "academic search returns works"
c=$(code "$BASE/api/education/search?q=chemistry&perPage=2"); check "education search" 200 "$c"
c=$(code "$BASE/api/education/taxonomy"); check "education taxonomy" 200 "$c"
c=$(code "$BASE/api/providers"); check "provider health registry" 200 "$c"

echo
echo "--- graceful degradation (impossible filters must still be 200) ---"
c=$(code "$BASE/api/education/search?q=zzzqxvnothingmatches&perPage=5&yearFrom=3000")
check "education graceful empty" 200 "$c"
c=$(code "$BASE/api/search?q=")
check "invalid query -> 400 not 500" 400 "$c"

echo
echo "--- paper detail + reader ---"
PID="doi%3A10.3322%2Fcaac.21871"
c=$(code "$BASE/api/papers/$PID"); check "paper detail API" 200 "$c"
c=$(code "$BASE/paper/$PID");      check "paper detail page" 200 "$c"
c=$(code "$BASE/api/papers/$PID/fulltext/status"); check "fulltext status API" 200 "$c"
c=$(code "$BASE/api/papers/$PID/fulltext");        check "fulltext API" 200 "$c"
c=$(code "$BASE/read/$PID");                       check "reader page" 200 "$c"
c=$(code "$BASE/api/papers/doi%3A10.9999%2Fnope-not-real/fulltext"); check "unknown fulltext -> 404" 404 "$c"

echo
echo "--- observability ---"
HDR=$(curl -s -D - -o /dev/null --max-time 30 "$BASE/api/search?q=climate&perPage=1" 2>/dev/null)
RID=$(printf '%s' "$HDR" | grep -i '^x-request-id:' | tr -d '\r' | awk '{print $2}')
[ -n "$RID" ] && ok "x-request-id returned" "$RID" || bad "x-request-id returned"
# Honor an inbound request id.
IN="smoke-$(date +%s)"
OUT=$(curl -s -D - -o /dev/null --max-time 30 -H "x-request-id: $IN" "$BASE/api/education/search?q=math&perPage=1" 2>/dev/null \
      | grep -i '^x-request-id:' | tr -d '\r' | awk '{print $2}')
[ "$OUT" = "$IN" ] && ok "inbound x-request-id honored" || bad "inbound x-request-id honored" "got '$OUT'"

echo
echo "--- guest authorization (must be 401) ---"
for p in library collections notes highlights history preferences; do
  c=$(code "$BASE/api/$p"); check "guest /api/$p" 401 "$c"
done

echo
echo "--- authentication ---"
EMAIL="smoke-$(date +%s)-$RANDOM@cogniflux.test"
c=$(curl -s -c "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 45 \
  -H 'content-type: application/json' -H "x-forwarded-for: 10.90.$((RANDOM%254+1)).$((RANDOM%254+1))" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passw0rd-9\"}" "$BASE/api/auth/register")
check "register" 201 "$c"
if printf '%s' "$(body)" | grep -qi password; then bad "register never leaks password field"; else ok "register never leaks password field"; fi
c=$(curl -s -b "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 "$BASE/api/auth/me"); check "session /api/auth/me" 200 "$c"

echo
echo "--- preferences (persona) ---"
c=$(curl -s -b "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 "$BASE/api/preferences"); check "GET preferences" 200 "$c"
patch() { curl -s -b "$J" -X PATCH -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 \
  -H 'content-type: application/json' -H "x-forwarded-for: 10.91.$((RANDOM%254+1)).$((RANDOM%254+1))" -d "$1" "$BASE/api/preferences"; }
# All six personas must be accepted.
for lv in elementary middle high vocational university researcher; do
  c=$(patch "{\"level\":\"$lv\"}"); check "PATCH persona $lv" 200 "$c"
done
# Partial PATCH must preserve unspecified fields (level stays 'researcher').
c=$(patch '{"interests":["robotika","otomotif"]}'); check "PATCH interests only" 200 "$c"
kept=$(body | grep -o '"level":"researcher"' | wc -l)
[ "$kept" -gt 0 ] && ok "partial PATCH preserves level" || bad "partial PATCH preserves level" "$(body | head -c 120)"
c=$(patch '{"level":"astronaut"}'); check "invalid persona rejected" 400 "$c"

echo
echo "--- library (authenticated write + read) ---"
c=$(curl -s -b "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 \
  -H 'content-type: application/json' \
  -d '{"paperKey":"doi:10.1111/smoke-test","work":{"title":"Smoke Test Paper","authors":[],"publicationYear":2026,"openAccess":{"isOa":true}}}' \
  "$BASE/api/library")
check "POST library" 201 "$c"
c=$(curl -s -b "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 "$BASE/api/library"); check "GET library" 200 "$c"
if printf '%s' "$(body)" | grep -q 'smoke-test'; then ok "saved item present in library"; else bad "saved item present in library"; fi
c=$(curl -s -b "$J" -o /tmp/smoke_body.$$ -w '%{http_code}' --max-time 30 "$BASE/library"); check "library page" 200 "$c"

echo
echo "--- logout ---"
c=$(curl -s -b "$J" -X POST -o /dev/null -w '%{http_code}' --max-time 30 "$BASE/api/auth/logout"); check "logout" 200 "$c"

rm -f "$J" /tmp/smoke_body.$$
echo
echo "== Summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAIL"
