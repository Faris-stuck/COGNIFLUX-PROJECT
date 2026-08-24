#!/bin/bash
# Measure production process memory at idle and under each workload phase.
# Samples RSS of the standalone server's process tree only (not the whole box).
set -u
BASE="${BASE:-http://127.0.0.1:3101}"
PORT="${PORT:-3101}"

PID=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -z "${PID:-}" ]; then echo "FATAL: nothing listening on :$PORT" >&2; exit 1; fi

# RSS of the server plus any children, in MB.
tree_rss_mb() {
  local pids; pids=$(pgrep -P "$PID" 2>/dev/null | tr '\n' ' ')
  ps -o rss= -p "$PID" $pids 2>/dev/null | awk '{s+=$1} END {print int(s/1024)}'
}
avail_mb() { free -m | sed -n '2p' | awk '{print $7}'; }

# Sample RSS every 0.3s in the background while a workload runs; print the peak.
peak_during() {
  local label="$1"; shift
  local tmp; tmp=$(mktemp)
  ( while true; do tree_rss_mb >> "$tmp"; sleep 0.3; done ) & local s=$!
  "$@" > /dev/null 2>&1
  sleep 0.5
  kill "$s" 2>/dev/null; wait "$s" 2>/dev/null
  local peak; peak=$(sort -n "$tmp" | tail -1)
  rm -f "$tmp"
  printf '  %-32s peak_rss=%sMB  (system available=%sMB)\n' "$label" "$peak" "$(avail_mb)"
}

echo "== production memory profile $(date -u +%FT%TZ) =="
echo "server pid: $PID   port: $PORT"
echo "VPS total: $(free -m | sed -n '2p' | awk '{print $2}')MB"
echo

printf '  %-32s rss=%sMB  (system available=%sMB)\n' "idle (post-startup)" "$(tree_rss_mb)" "$(avail_mb)"

peak_during "first request (homepage)"  curl -s --max-time 60 "$BASE/"
peak_during "health probe"              curl -s --max-time 30 "$BASE/health"
peak_during "academic search"           curl -s --max-time 60 "$BASE/api/search?q=quantum+computing&perPage=20"
peak_during "education search"          curl -s --max-time 60 "$BASE/api/education/search?q=biology&perPage=20"
peak_during "reader load (full text)"   curl -s --max-time 90 "$BASE/read/doi%3A10.3322%2Fcaac.21871"
peak_during "paper detail page"         curl -s --max-time 60 "$BASE/paper/doi%3A10.3322%2Fcaac.21871"

# Concurrency burst: 20 parallel mixed requests.
# NOTE: must run in a SUBSHELL. A bare `wait` here would also wait on the
# sampler loop started by peak_during, which never exits -> hang.
burst() {
  (
    for i in $(seq 1 10); do
      curl -s --max-time 60 "$BASE/" > /dev/null &
      curl -s --max-time 60 "$BASE/api/search?q=test$i&perPage=5" > /dev/null &
    done
    wait
  )
}
peak_during "20 concurrent requests" burst

echo
printf '  %-32s rss=%sMB\n' "settled (after workload)" "$(tree_rss_mb)"
echo
echo "--- system memory now ---"
free -m
