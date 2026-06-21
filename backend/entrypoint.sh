#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] Waiting for Postgres at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}..."
until python3 -c "
import socket, os, sys
s = socket.socket()
s.settimeout(2)
try:
    s.connect((os.environ.get('POSTGRES_HOST','postgres'), int(os.environ.get('POSTGRES_PORT','5432'))))
    s.close()
except Exception:
    sys.exit(1)
"; do
  echo "[entrypoint] Postgres not ready, retrying in 2s..."
  sleep 2
done

echo "[entrypoint] Running database migrations..."
alembic upgrade head

echo "[entrypoint] Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-2}"
