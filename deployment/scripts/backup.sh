#!/usr/bin/env bash
# Back up the TrackQA Postgres database to a timestamped dump.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
set -a; [ -f .env ] && . .env; set +a

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/trackqa_${STAMP}.sql.gz"

echo "==> Dumping database to $OUT"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "$OUT"

# Retention: keep last 14 dumps.
echo "==> Applying retention (keep last 14)"
ls -1t "$BACKUP_DIR"/trackqa_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "==> Backup complete: $OUT"
