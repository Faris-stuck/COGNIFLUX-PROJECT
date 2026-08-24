#!/bin/bash
# Pre-build state snapshot for the Release Candidate run. READ ONLY.
# Records git, listeners, our node processes, service health and memory so the
# exact pre-build state can be compared/rolled back to afterwards.
set -u
cd "$(dirname "$0")/.."
OUT="${1:-/home/ubuntu/backups/cogniflux/rc-state-$(date +%Y%m%d-%H%M%S).txt}"
mkdir -p "$(dirname "$OUT")"

{
  echo "=== SNAPSHOT $(date -u +%FT%TZ) ==="
  echo
  echo "--- git ---"
  echo "branch: $(git branch --show-current)"
  echo "HEAD:   $(git log --oneline -1)"
  echo "status (porcelain):"
  git status --porcelain
  echo "uncommitted tracked changes: $(git diff --name-only HEAD | wc -l)"
  echo
  echo "--- listeners (3100/3101/5432/6379) ---"
  ss -tlnp 2>/dev/null | grep -E ':3100|:3101|:5432|:6379' || echo "(none)"
  echo
  echo "--- cogniflux node processes ---"
  pgrep -af "next|node" 2>/dev/null | grep -i cogniflux || echo "(none matching cogniflux)"
  echo
  echo "--- ALL next/node pids (do not kill unrelated ones) ---"
  pgrep -af "next-server|next dev|next start" 2>/dev/null || echo "(none)"
  echo
  echo "--- service health ---"
  printf 'postgres: '; pg_isready 2>&1 | tail -1
  printf 'redis:    '; redis-cli ping 2>&1 | tail -1
  printf 'app3100:  '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3100/api/health 2>/dev/null || echo "no response"
  echo
  echo "--- memory ---"
  free -m
  echo
  echo "--- build artifacts ---"
  echo ".next size: $(du -sh .next 2>/dev/null | cut -f1 || echo absent)"
  echo "standalone: $([ -d .next/standalone ] && echo present || echo absent)"
} | tee "$OUT"

echo
echo "snapshot written to: $OUT"
