#!/bin/bash
# Smoke test: persona/preferences API against the live dev server.
# Registers a throwaway user, then exercises GET/PATCH + guest 401.
set -u
BASE="${BASE_URL:-http://localhost:3100}"
J=$(mktemp)
EMAIL="persona-$(date +%s)@cogniflux.test"

echo "== guest =="
curl -s -o /dev/null -w "GET  /api/preferences (guest) -> %{http_code}\n" "$BASE/api/preferences"

echo "== register =="
curl -s -c "$J" -o /tmp/reg.json -w "POST /api/auth/register        -> %{http_code}\n" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passw0rd-9\",\"name\":\"Persona Smoke\"}" \
  "$BASE/api/auth/register"

echo "== initial GET =="
curl -s -b "$J" -w "\nGET  /api/preferences          -> %{http_code}\n" "$BASE/api/preferences"

echo "== PATCH level only (insert arm) =="
curl -s -b "$J" -X PATCH -H 'content-type: application/json' \
  -d '{"level":"vocational"}' -w "\nPATCH level                    -> %{http_code}\n" "$BASE/api/preferences"

echo "== PATCH interests only (update arm, must keep level) =="
curl -s -b "$J" -X PATCH -H 'content-type: application/json' \
  -d '{"interests":["robotika","otomotif"]}' -w "\nPATCH interests                -> %{http_code}\n" "$BASE/api/preferences"

echo "== invalid level rejected =="
curl -s -b "$J" -X PATCH -H 'content-type: application/json' \
  -d '{"level":"astronaut"}' -w "\nPATCH invalid level            -> %{http_code}\n" "$BASE/api/preferences"

echo "== final GET =="
curl -s -b "$J" -w "\nGET  /api/preferences          -> %{http_code}\n" "$BASE/api/preferences"
rm -f "$J" /tmp/reg.json
