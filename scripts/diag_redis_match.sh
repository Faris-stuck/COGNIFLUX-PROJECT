#!/bin/bash
# Diagnose the REDIS_URL "leak" reported by scan_secrets.sh WITHOUT printing the value.
set -u
cd /home/ubuntu/cogniflux

set -a
. ./.env.local
set +a

echo "REDIS_URL length: ${#REDIS_URL}"
if printf '%s' "$REDIS_URL" | grep -q '@'; then
  echo "REDIS_URL contains credentials: YES"
else
  echo "REDIS_URL contains credentials: NO (host:port only)"
fi
# Redact everything but scheme + port shape.
printf 'REDIS_URL shape: '
printf '%s' "$REDIS_URL" | sed -E 's|^(redis[s]?://)[^:/@]*(:[0-9]+)?/?.*|\1<host>\2|'
echo

echo "--- files containing the literal value (names only) ---"
grep -rlF -- "$REDIS_URL" .next/static 2>/dev/null | sed 's/^/  [CLIENT] /' | head -5
grep -rlF -- "$REDIS_URL" .next/server 2>/dev/null | sed 's/^/  [SERVER] /' | head -5
grep -rlF -- "$REDIS_URL" .next/standalone 2>/dev/null | sed 's/^/  [STANDALONE] /' | head -5

echo
echo "--- is the value hardcoded in our source? ---"
if grep -rlF -- "$REDIS_URL" src/ 2>/dev/null; then
  echo "  ^^ FOUND IN SOURCE (real problem)"
else
  echo "  not in src/ (no hardcoded secret in source)"
fi

echo
echo "--- how many chars of the value are actually distinctive? ---"
echo "  (a short value like redis://localhost:6379 matches library defaults)"
