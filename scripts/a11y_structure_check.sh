#!/bin/bash
# Structural accessibility / UI sanity check for the public Cogniflux pages.
# Read-only: fetches each page over HTTPS and counts landmark elements.
set -u
BASE="${BASE_URL:-https://cogniflux.web.id}"

for p in / /search /learn /research /explore /login; do
  H=$(curl -s --max-time 25 "$BASE$p")
  LANG=$(printf '%s' "$H" | grep -oE '<html[^>]*lang="[a-zA-Z-]*"' | grep -oE 'lang="[a-zA-Z-]*"' | head -1)
  H1=$(printf '%s' "$H" | grep -o '<h1' | wc -l)
  MAIN=$(printf '%s' "$H" | grep -o '<main' | wc -l)
  NAV=$(printf '%s' "$H" | grep -o '<nav' | wc -l)
  IMGS=$(printf '%s' "$H" | grep -oE '<img [^>]*>' | wc -l)
  IMGNOALT=$(printf '%s' "$H" | grep -oE '<img [^>]*>' | grep -v 'alt=' | wc -l)
  ARIA=$(printf '%s' "$H" | grep -o 'aria-label' | wc -l)
  TITLE=$(printf '%s' "$H" | grep -oE '<title>[^<]*' | head -1 | cut -c8-50)
  printf "%-10s %-10s h1=%s main=%s nav=%s img=%s img_noalt=%s aria-label=%s title=%s\n" \
    "$p" "${LANG:-MISSING}" "$H1" "$MAIN" "$NAV" "$IMGS" "$IMGNOALT" "$ARIA" "$TITLE"
done
