# VeriOps — Deployment (v1)

Target: a single internal VM running Docker + Docker Compose.

## Prerequisites

- Docker Engine 24+ and the Compose plugin (`docker compose`).
- `openssl` (for the self-signed certificate).
- Open ports 80 and 443 on the VM (or behind your internal load balancer).

## First deployment

```bash
git clone <your-repo> veriops && cd veriops
cp .env.example .env
# Edit .env: set JWT_SECRET_KEY, FIRST_ADMIN_*, POSTGRES_PASSWORD, CORS_ORIGINS
bash deployment/scripts/setup.sh
```

`setup.sh` will:
1. create `.env` if missing,
2. generate a self-signed TLS cert under `deployment/nginx/ssl/`,
3. `docker compose up -d --build`,
4. wait for the backend health check.

The backend container runs `alembic upgrade head` on start (see `backend/entrypoint.sh`),
then bootstraps roles, the default organization, and the first admin.

Visit `https://localhost` (or `https://<vm-host>`), accept the self-signed warning, and
log in with the first-admin credentials.

## TLS with real certificates

Replace the generated files with CA-issued ones, keeping the names:

```
deployment/nginx/ssl/veriops.crt
deployment/nginx/ssl/veriops.key
```

Then `docker compose restart nginx`. Update `server_name` in
`deployment/nginx/conf.d/veriops.conf` to your hostname for stricter matching.

## Day-2 operations

```bash
# Health across all services
bash deployment/scripts/healthcheck.sh

# Database backup (gzipped pg_dump, keeps last 14)
bash deployment/scripts/backup.sh
#   schedule via cron, e.g.:  0 2 * * *  /path/veriops/deployment/scripts/backup.sh

# Restore from a dump (prompts for confirmation)
bash deployment/scripts/restore.sh backups/veriops_YYYYMMDD_HHMMSS.sql.gz

# Truncate container logs to reclaim disk
bash deployment/scripts/rotate-logs.sh
```

## Updating the application

```bash
git pull
docker compose up -d --build      # migrations run automatically on backend start
bash deployment/scripts/healthcheck.sh
```

## Data & persistence

Named Docker volumes:
- `veriops_pgdata` — PostgreSQL data
- `veriops_redisdata` — Redis AOF
- `veriops_uploads` — attachment storage (designed to move to S3/MinIO later)

Backups cover the database. For a full migration, also snapshot `veriops_uploads`.

## Scaling later (not required for v1)

- Run multiple `backend` replicas; the backend is stateless (JWT, no in-memory sessions).
  Point the nginx `proxy_pass` at an upstream with several backends.
- Move Postgres/Redis to managed/external services by changing `.env` host vars.
- Introduce the background worker (scaffolded in `backend/app/workers`) for heavy reports.
- Add Redis-based rate limiting at the edge or in `app/core/rate_limit.py`.

## Troubleshooting

- **Backend keeps restarting**: check `docker compose logs backend`. Most often the DB
  isn't ready yet (entrypoint waits/retries) or `.env` is missing a required var.
- **502 from nginx**: backend or frontend container not healthy — run the healthcheck.
- **Can't log in**: confirm `FIRST_ADMIN_*` were set before the first boot. If you set
  them after the DB volume was created, either create the user via a fresh volume
  (`docker compose down -v`, then `setup.sh`) or add a user via an existing admin.
- **Browser TLS warning**: expected with the self-signed cert; install a real cert to remove it.
```
