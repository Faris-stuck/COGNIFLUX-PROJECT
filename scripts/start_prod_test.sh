#!/bin/bash
# Launch the standalone production build on a controlled, loopback-only port.
# Deliberately NOT a public deployment: no proxy, no TLS, no process manager.
#
# The standalone server does not read .env.local, so DATABASE_URL / REDIS_URL are
# sourced here and exported into the child process only. Values are never echoed.
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-3101}"
LOG="${LOG:-/tmp/cogniflux-prod-$PORT.log}"

if [ ! -f .next/standalone/server.js ]; then
  echo "FATAL: .next/standalone/server.js missing — run scripts/build_prod.sh first" >&2
  exit 1
fi

# Static assets are not copied into standalone by design; wire them up so the
# production server can serve /_next/static and /public.
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public 2>/dev/null

set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

# Report presence by NAME only — never values.
for v in DATABASE_URL REDIS_URL; do
  if [ -z "${!v:-}" ]; then echo "$v = missing"; else echo "$v = set"; fi
done

echo "starting standalone server on 127.0.0.1:$PORT (log: $LOG)"
cd .next/standalone
exec env \
  NODE_ENV=production \
  NODE_OPTIONS="--max-old-space-size=768" \
  PORT="$PORT" \
  HOSTNAME=127.0.0.1 \
  node server.js
