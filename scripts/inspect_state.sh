#!/bin/bash
cd ~/cogniflux
DB_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
psql "$DB_URL" -c "\dt" 2>&1 | head -50
echo "---HEALTH---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/health
curl -s http://localhost:3100/api/health | head -c 400
echo
echo "---HOMEPAGE---"
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:3100/
