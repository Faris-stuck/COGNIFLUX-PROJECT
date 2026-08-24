#!/bin/bash
# Reproduce: does /api/search work when Redis is unreachable?
set -u
cd /home/ubuntu/cogniflux
set -a; . ./.env.local; set +a

( cd .next/standalone && env NODE_ENV=production PORT=3104 HOSTNAME=127.0.0.1 \
    NODE_OPTIONS="--max-old-space-size=512" \
    DATABASE_URL="$DATABASE_URL" REDIS_URL="redis://127.0.0.1:59998" \
    node server.js > /tmp/cf-redisdown.log 2>&1 & echo $! > /tmp/cf-redisdown.pid )

for _ in $(seq 1 40); do
  ss -tlnH "sport = :3104" 2>/dev/null | grep -q LISTEN && break
  sleep 0.5
done
echo "listener up"

echo "--- search with 90s budget, timing it ---"
curl -s -o /tmp/rd_body.txt -w 'http_code=%{http_code} time_total=%{time_total}s\n' --max-time 90 \
  "http://127.0.0.1:3104/api/search?q=climate&perPage=2"
echo "body head: $(head -c 200 /tmp/rd_body.txt)"

echo
echo "--- second call (any caching path warm?) ---"
curl -s -o /tmp/rd_body2.txt -w 'http_code=%{http_code} time_total=%{time_total}s\n' --max-time 90 \
  "http://127.0.0.1:3104/api/search?q=climate&perPage=2"
echo "body head: $(head -c 200 /tmp/rd_body2.txt)"

echo
echo "--- homepage with Redis down ---"
curl -s -o /dev/null -w 'homepage http_code=%{http_code} time_total=%{time_total}s\n' --max-time 90 \
  "http://127.0.0.1:3104/"

echo
echo "--- server log (redis errors) ---"
grep -c "redis" /tmp/cf-redisdown.log 2>/dev/null | sed 's/^/redis log lines: /'
tail -12 /tmp/cf-redisdown.log

kill "$(cat /tmp/cf-redisdown.pid)" 2>/dev/null
rm -f /tmp/cf-redisdown.pid
