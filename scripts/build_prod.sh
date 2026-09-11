#!/bin/bash
# Production build with memory instrumentation.
# Samples RSS of the whole node process tree + system free RAM every 2s while
# `npm run build` runs, so peak build memory is measured rather than guessed.
set -u
cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
LOG="/tmp/cogniflux-build-$STAMP.log"
MEMLOG="/tmp/cogniflux-build-mem-$STAMP.log"

echo "== build start $(date -u +%FT%TZ) =="
echo "log:    $LOG"
echo "memlog: $MEMLOG"
free -m | sed -n '2p' | awk '{print "pre-build: used="$3"MB free="$4"MB available="$7"MB"}'

# Memory sampler: total RSS of every node process + system available MB.
(
  while true; do
    RSS=$(ps -eo rss,comm 2>/dev/null | awk '$2 ~ /node|next/ {s+=$1} END {print int(s/1024)}')
    AVAIL=$(free -m | sed -n '2p' | awk '{print $7}')
    USED=$(free -m | sed -n '2p' | awk '{print $3}')
    SWAP=$(free -m | sed -n '3p' | awk '{print $3}')
    echo "$(date +%s) node_rss_mb=$RSS used_mb=$USED avail_mb=$AVAIL swap_mb=$SWAP"
    sleep 2
  done
) > "$MEMLOG" 2>/dev/null &
SAMPLER=$!

START=$(date +%s)
# Single-threaded, capped heap. NEXT_TELEMETRY_DISABLED avoids a network hop.
NODE_OPTIONS="--max-old-space-size=1536" \
NEXT_TELEMETRY_DISABLED=1 \
UV_THREADPOOL_SIZE=2 \
  npm run build > "$LOG" 2>&1
BUILD_EXIT=$?
END=$(date +%s)

kill "$SAMPLER" 2>/dev/null
wait "$SAMPLER" 2>/dev/null

echo
echo "== build exit=$BUILD_EXIT duration=$((END-START))s =="
echo
echo "--- peak memory during build ---"
awk '{
  for (i=2;i<=NF;i++) { split($i,kv,"="); v[kv[1]]=kv[2] }
  if (v["node_rss_mb"]+0 > maxrss) maxrss=v["node_rss_mb"]+0
  if (minavail=="" || v["avail_mb"]+0 < minavail) minavail=v["avail_mb"]+0
  if (v["used_mb"]+0 > maxused) maxused=v["used_mb"]+0
  if (v["swap_mb"]+0 > maxswap) maxswap=v["swap_mb"]+0
  n++
} END {
  printf "samples=%d peak_node_rss=%dMB peak_system_used=%dMB min_available=%dMB peak_swap=%dMB\n", n, maxrss, maxused, minavail, maxswap
}' "$MEMLOG"

echo
echo "--- build log tail ---"
tail -30 "$LOG"

if [ "$BUILD_EXIT" -eq 0 ]; then
  # systemd runs the app as ubuntu. When this script is invoked as root,
  # make the standalone artifact writable by the runtime user and stage the
  # client assets so SSR and browser hydration ship as one deployable unit.
  if [ "$(id -u)" -eq 0 ]; then
    chown -R ubuntu:ubuntu .next/standalone .next/static
  fi
  mkdir -p .next/standalone/.next
  rm -rf .next/standalone/.next/static
  cp -a .next/static .next/standalone/.next/static
  if [ -d public ]; then
    rm -rf .next/standalone/public
    cp -a public .next/standalone/public
  fi
  echo "artifact staging: OK"
fi

exit "$BUILD_EXIT"
