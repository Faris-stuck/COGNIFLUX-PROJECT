#!/bin/bash
# Inspect how the built fulltext route references @exodus/bytes (ESM-only pkg
# pulled in by isomorphic-dompurify -> jsdom chain) to decide the right fix.
set -u
cd /home/ubuntu/cogniflux
F=".next/standalone/.next/server/app/api/papers/[id]/fulltext/route.js"

echo "=== file exists? ==="
ls -la "$(dirname "$F")" 2>/dev/null | head -5

echo
echo "=== references to encoding-lite ==="
grep -o 'encoding-lite[^"]*' "$F" 2>/dev/null | head -3

echo
echo "=== require/import of @exodus/bytes with surrounding context ==="
grep -o '.\{60\}@exodus/bytes[^"]*"' "$F" 2>/dev/null | head -4

echo
echo "=== does the main repo node_modules copy work under CJS require? ==="
node -e "try { const m = require('/home/ubuntu/cogniflux/node_modules/@exodus/bytes/encoding-lite.js'); console.log('CJS require OK', typeof m); } catch(e) { console.log('CJS require FAILS:', e.message.slice(0,120)); }"

echo
echo "=== what does html-encoding-sniffer actually import? ==="
grep -n "encoding-lite\|@exodus" node_modules/html-encoding-sniffer/lib/*.js 2>/dev/null | head -3
