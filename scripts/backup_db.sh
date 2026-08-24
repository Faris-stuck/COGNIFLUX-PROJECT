#!/bin/bash
# Backup Cogniflux DB as postgres superuser (cogniflux role lacks sequence perms)
set -e
mkdir -p ~/backups/cogniflux
STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump cogniflux | gzip > ~/backups/cogniflux/cogniflux-pre-$STAMP.sql.gz
ls -lh ~/backups/cogniflux/cogniflux-pre-$STAMP.sql.gz
gzip -t ~/backups/cogniflux/cogniflux-pre-$STAMP.sql.gz && echo "GZIP_OK"
LINES=$(zcat ~/backups/cogniflux/cogniflux-pre-$STAMP.sql.gz | wc -l)
echo "DUMP_LINES=$LINES"
zcat ~/backups/cogniflux/cogniflux-pre-$STAMP.sql.gz | grep -c "CREATE TABLE" || true
