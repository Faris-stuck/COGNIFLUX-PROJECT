#!/bin/bash
# Launch the standalone production build (used by the systemd unit).
# Reads .env.local, exports it into the child process only. Never echoes values.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3100}"

if [ ! -f .next/standalone/server.js ]; then
  echo "FATAL: .next/standalone/server.js missing — run scripts/build_prod.sh first" >&2
  exit 1
fi

# Static assets are not copied into standalone by design; wire them up.
# Fail closed if the service user cannot update the standalone artifact; a
# successful SSR boot with missing client assets is not a healthy deployment.
if [ ! -d .next/static ]; then
  echo "FATAL: .next/static missing — build artifact is incomplete" >&2
  exit 1
fi
if [ ! -w .next/standalone ] || { [ -e .next/standalone/.next ] && [ ! -w .next/standalone/.next ]; }; then
  echo "FATAL: standalone artifact is not writable by $(id -un); fix ownership before restart" >&2
  exit 1
fi
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -a .next/static .next/standalone/.next/static
[ -d public ] && { rm -rf .next/standalone/public; cp -a public .next/standalone/public; } || true

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
  NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt" \
  node server.js
