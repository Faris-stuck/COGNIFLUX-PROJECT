#!/bin/bash
# Launch the standalone production build (used by the systemd unit).
# Reads .env.local, exports it into the child process only. Never echoes values.
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-3100}"

if [ ! -f .next/standalone/server.js ]; then
  echo "FATAL: .next/standalone/server.js missing — run scripts/build_prod.sh first" >&2
  exit 1
fi

# Static assets are not copied into standalone by design; wire them up.
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public 2>/dev/null

set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

cd .next/standalone
exec env \
  NODE_ENV=production \
  NODE_OPTIONS="--max-old-space-size=768" \
  PORT="$PORT" \
  HOSTNAME=127.0.0.1 \
  node server.js
