# VeriOps

A quality operations platform for test management, test execution, defect tracking, reporting, and AI-assisted test generation.
This is the **first version**: a real, runnable end-to-end slice — not a demo, not a
static page. It proves the architecture and the core QA workflow so the remaining
modules can be added one at a time without rewriting the foundation.

## Core Capabilities

A user can, end to end:

1. **Log in** (JWT auth; no hardcoded users — the first admin is bootstrapped from env).
2. Be **routed by role** — normal users see the Workspace; admins additionally get the Admin Console.
3. **Create a project** (`PROJ-001`).
4. **Create a test case** (`TC-001`).
5. **Create a test run** (`RUN-001`) over selected (or all) test cases.
6. **Execute** each test case in the run.
7. **Mark a test Failed**.
8. **Create a defect** (`BUG-001`) directly from the failed result.
9. **View the linked defect** with traceability back to the test result.
10. **See a basic report** — execution summary, defect counts, and a release-readiness signal.

Admin-only areas (Users, Audit Logs, Settings → Integrations) are not visible or
reachable for normal users. Integrations exist as **structure only** under
Admin → Settings → Integrations; no integration UI appears in the normal workspace.

## Stack

| Layer        | Technology                                   |
|--------------|----------------------------------------------|
| Frontend     | React 18 + TypeScript + Vite + React Router  |
| Backend      | FastAPI + SQLAlchemy 2 + Alembic + Pydantic  |
| Database     | PostgreSQL 16                                |
| Cache/queue  | Redis 7 (wired; used lightly in v1)          |
| Auth         | JWT (access + refresh), bcrypt hashing       |
| Edge         | Nginx (TLS termination, reverse proxy)       |
| Orchestration| Docker Compose                               |

## Repository layout

```
veriops/
├── backend/            FastAPI app (api / core / models / schemas / services / repositories)
│   ├── app/
│   ├── alembic/        migrations (0001_initial)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/           React + TS app (pages / layouts / services / guards / components)
│   ├── src/
│   ├── Dockerfile      multi-stage build -> nginx
│   └── nginx.spa.conf
├── deployment/
│   ├── nginx/          edge nginx config + ssl/
│   └── scripts/        setup / backup / restore / healthcheck / rotate-logs
├── docs/               architecture / security / api / deployment
├── docker-compose.yml
└── .env.example
```

## Quick start (internal VM)

Prerequisites: Docker + Docker Compose, and `openssl` for the self-signed cert.

```bash
git clone <your-repo> veriops && cd veriops

# Edit secrets first:
cp .env.example .env
#   set JWT_SECRET_KEY (openssl rand -hex 32)
#   set FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD
#   set POSTGRES_PASSWORD

# One-command bring-up (creates cert, builds, starts, runs migrations, waits for health):
bash deployment/scripts/setup.sh
```

Then open **https://localhost** (accept the self-signed certificate warning).
Log in with the `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` you set.

- App: `https://localhost`
- API docs: disabled in production (set ENVIRONMENT=development to enable)
- Health: `http://localhost/health`

### Trying the full workflow

1. Log in as the admin.
2. Go to **Admin Console → Users** and create a `TESTER` user if you want to verify
   role separation (log in as them: no Admin Console link appears).
3. Back in the **Workspace → Projects**, create a project.
4. Open the project → **Test Cases** tab → create a test case.
5. **Test Runs** tab → create a run (leave selection empty to include all cases).
6. Click **Execute** → set a case to **Failed** → **Create defect**.
7. The **Defects** tab shows `BUG-001` linked to the failing test result.
8. The **Report** tab shows execution stats and readiness.

## Local development (without Docker)

Backend:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# point POSTGRES_HOST at a local Postgres, then:
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev        # Vite dev server proxies /api -> http://localhost:8000
```

## Operations

```bash
bash deployment/scripts/healthcheck.sh     # probe all services
bash deployment/scripts/backup.sh          # gzipped pg_dump, 14-dump retention
bash deployment/scripts/restore.sh <dump>  # restore from a dump
bash deployment/scripts/rotate-logs.sh     # truncate container logs
```

## Documentation

- `docs/architecture.md` — layers, data model, request flow
- `docs/security.md` — auth, RBAC, RLS approach, secrets
- `docs/api.md` — endpoint reference
- `docs/deployment.md` — VM deployment, TLS, scaling notes

## Notes / honest scope

- Tokens are stored in `localStorage` (fine for an internal tool in v1; swap to
  httpOnly cookies later if desired).
- TLS uses a **self-signed** cert by default — replace `deployment/nginx/ssl/*`
  with real certs for any non-local use.
- Redis is wired and ready for rate limiting/caching; v1 does not yet enforce limits.
- Integrations are structural only. No credentials are stored or synced in v1.
- This slice deliberately omits requirements/releases/notifications and the rest of
  the broader module list; the data model and folder structure leave room for them.
