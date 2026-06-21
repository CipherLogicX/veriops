# Changelog

## 0.1.0 — v1 vertical slice
- Login + JWT auth (no hardcoded users; first admin from env).
- Role-based routing: Workspace vs Admin Console.
- Projects, Test Cases, Test Runs, Test Execution, Defects, Basic Report.
- Defect creation from a failed test result with traceability link.
- Admin: Users, Audit Logs, Settings → Integrations (structure only).
- RBAC enforced server-side; project access checks.
- Alembic initial migration; PostgreSQL + Redis.
- Docker Compose with edge Nginx (self-signed HTTPS).
- Setup / backup / restore / healthcheck / rotate-logs scripts.
- Docs: README, architecture, security, api, deployment.
