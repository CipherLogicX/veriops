#!/usr/bin/env bash
# Restore the TrackQA database from a gzipped dump.
# Usage: ./restore.sh path/to/trackqa_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
set -a; [ -f .env ] && . .env; set +a

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: $0 <path-to-dump.sql.gz>"; exit 1
fi

echo "!! This will OVERWRITE the current '${POSTGRES_DB}' database."
read -r -p "Type 'yes' to continue: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }

echo "==> Restoring from $DUMP"
gunzip -c "$DUMP" | docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
echo "==> Restore complete"
