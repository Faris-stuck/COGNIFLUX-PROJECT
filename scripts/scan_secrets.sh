#!/bin/bash
# Secret-leak scan of build artifacts.
# Reads secret VALUES from .env.local into shell vars, greps the built output
# for them, and prints ONLY the variable name + verdict. Values are never
# echoed, never written to a file, and never appear in the log.
set -u
cd "$(dirname "$0")/.."

echo "== secret leak scan $(date -u +%FT%TZ) =="
echo "scanning: .next/static .next/server .next/standalone"
echo

FAIL=0

# Client bundles must never contain any secret. Server bundles may legitimately
# reference process.env.X by NAME, but must not contain inlined secret values.
#
# Classification: a URL with no credentials (e.g. redis://localhost:6379) is a
# non-secret default, not a leak — flagging it would train us to ignore the
# scanner. Only values that actually carry credentials are LEAK-worthy.
has_credentials() {
  printf '%s' "$1" | grep -q '://[^/@]*:[^/@]*@'
}

scan_value() {
  local name="$1" value="$2" scope="$3"
  if [ -z "$value" ]; then
    printf '  [SKIP] %-22s (unset/empty)\n' "$name"
    return
  fi
  # Only the literal value is searched; the value itself is never printed.
  if grep -rqF -- "$value" $scope 2>/dev/null; then
    if has_credentials "$value"; then
      printf '  [LEAK] %-22s credential-bearing value found in %s\n' "$name" "$scope"
      FAIL=1
    else
      printf '  [INFO] %-22s present, but carries no credentials (non-secret default)\n' "$name"
    fi
  else
    printf '  [OK]   %-22s not present in %s\n' "$name" "$scope"
  fi
}

# Load env without exporting to the log.
set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

echo "--- full secret values vs ALL build output ---"
scan_value "DATABASE_URL" "${DATABASE_URL:-}" ".next/static .next/server .next/standalone"
scan_value "REDIS_URL"    "${REDIS_URL:-}"    ".next/static .next/server .next/standalone"

# The Postgres password on its own is the highest-value token; check it alone.
PGPASS=$(printf '%s' "${DATABASE_URL:-}" | sed -n 's|^[^:]*://[^:]*:\([^@]*\)@.*|\1|p')
scan_value "DATABASE_URL:password" "$PGPASS" ".next/static .next/server .next/standalone"

echo
echo "--- non-public env values vs CLIENT bundles (must never appear at all) ---"
scan_client() {
  local name="$1" value="$2"
  if [ -z "$value" ]; then printf '  [SKIP] %-22s (unset/empty)\n' "$name"; return; fi
  if grep -rqF -- "$value" .next/static 2>/dev/null; then
    printf '  [FAIL] %-22s reached the CLIENT bundle\n' "$name"; FAIL=1
  else
    printf '  [OK]   %-22s absent from client bundle\n' "$name"
  fi
}
scan_client "DATABASE_URL"    "${DATABASE_URL:-}"
scan_client "REDIS_URL"       "${REDIS_URL:-}"
scan_client "UNPAYWALL_EMAIL" "${UNPAYWALL_EMAIL:-}"

echo
echo "--- .env files inside artifacts ---"
found=$(find .next -name ".env*" 2>/dev/null)
if [ -n "$found" ]; then
  echo "  [FAIL] .env file(s) present in artifacts:"; echo "$found" | sed 's/^/    /'; FAIL=1
else
  echo "  [OK]   no .env files inside .next/"
fi

echo
echo "--- generic high-risk patterns in client bundles ---"
for pat in 'postgresql://' 'postgres://' 'redis://' 'BEGIN RSA PRIVATE KEY' 'BEGIN PRIVATE KEY'; do
  if grep -rqF -- "$pat" .next/static 2>/dev/null; then
    printf '  [FAIL] pattern present in client bundle: %s\n' "$pat"; FAIL=1
  else
    printf '  [OK]   pattern absent from client bundle: %s\n' "$pat"
  fi
done

echo
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS (no secret leakage detected)" || echo "RESULT: FAIL (see [LEAK]/[FAIL] above)"
exit "$FAIL"
