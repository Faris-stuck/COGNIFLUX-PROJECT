#!/usr/bin/env bash
# Cogniflux scheduled database backup with retention.
#
# Difference from backup_db.sh (the manual pre-change dump):
#   - runs unattended from a systemd timer
#   - names dumps cogniflux-auto-<stamp>.sql.gz
#   - verifies gzip integrity AND that the dump contains the expected table count
#   - prunes dumps older than RETAIN_DAYS, always keeping at least KEEP_MIN newest
#   - exits non-zero on any verification failure so the timer records a failure
#
# Usage: bash scripts/backup_db_scheduled.sh
set -euo pipefail

DB=cogniflux
DEST=/home/ubuntu/backups/cogniflux
RETAIN_DAYS=14
KEEP_MIN=7
MIN_TABLES=20

mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DEST/cogniflux-auto-$STAMP.sql.gz"

sudo -u postgres pg_dump "$DB" | gzip >"$OUT"

# --- verification ---
if ! gzip -t "$OUT"; then
  echo "FAIL: gzip integrity check failed for $OUT" >&2
  exit 1
fi

TABLES=$(gzip -dc "$OUT" | grep -c '^CREATE TABLE' || true)
LINES=$(gzip -dc "$OUT" | wc -l)
SIZE=$(stat -c%s "$OUT")

if [ "$TABLES" -lt "$MIN_TABLES" ]; then
  echo "FAIL: only $TABLES CREATE TABLE statements (expected >= $MIN_TABLES) in $OUT" >&2
  exit 1
fi
if [ "$SIZE" -lt 10000 ]; then
  echo "FAIL: dump suspiciously small ($SIZE bytes)" >&2
  exit 1
fi

echo "OK $OUT size=${SIZE}B lines=$LINES tables=$TABLES"

# --- retention: delete auto dumps older than RETAIN_DAYS, keep KEEP_MIN newest ---
mapfile -t ALL < <(ls -1t "$DEST"/cogniflux-auto-*.sql.gz 2>/dev/null || true)
if [ "${#ALL[@]}" -gt "$KEEP_MIN" ]; then
  for f in "${ALL[@]:$KEEP_MIN}"; do
    if [ -n "$(find "$f" -mtime +"$RETAIN_DAYS" -print -quit 2>/dev/null)" ]; then
      rm -f -- "$f"
      echo "pruned $f"
    fi
  done
fi

echo "retained=$(ls -1 "$DEST"/cogniflux-auto-*.sql.gz 2>/dev/null | wc -l)"
