# TrackQA — Architecture (v1)

## Overview

TrackQA is split into a React SPA, a FastAPI backend, a PostgreSQL database, and an
edge Nginx that terminates TLS and routes traffic. Redis is present for future rate
limiting and caching. Everything runs under Docker Compose on a single internal VM in
v1, but no design decision blocks moving to multiple backend replicas or managed
Postgres later.

```
            ┌────────────┐   https    ┌──────────────────────────┐
  Browser ──▶   Nginx    │────────────▶  frontend (static SPA)    │
            │  (edge,TLS)│            └──────────────────────────┘
            │            │   /api/*     ┌──────────────────────────┐
            │            │────────────▶  backend (FastAPI)         │
            └────────────┘            │   ├─ api/v1 routes          │
                                      │   ├─ services (logic)       │
                                      │   ├─ repositories (planned) │
                                      │   └─ models (SQLAlchemy)    │
                                      └───────┬───────────┬────────┘
                                              │           │
                                       ┌──────▼───┐  ┌────▼─────┐
                                       │ Postgres │  │  Redis   │
                                       └──────────┘  └──────────┘
```

## Backend layering

Routes are thin: they parse the request, enforce auth/access, and delegate.

- `app/api/v1/*` — HTTP routing only (request/response, dependency wiring).
- `app/services/*` — business logic (project creation, run execution, defect
  creation, reporting, key generation, audit writes).
- `app/models/*` — SQLAlchemy ORM models. Split by domain (identity, project, qa, system).
- `app/schemas/*` — Pydantic request/response models, kept separate from ORM models.
- `app/core/*` — config, database/session, security (JWT + hashing), permissions,
  auth dependencies, exception handling, bootstrap.
- `app/repositories/*` — reserved for data-access objects as queries grow; in v1 the
  services use the session directly to keep the slice small and readable.

A repository layer is scaffolded (folder + package) and is the next refactor target
once a module has enough query surface to justify it.

## Request flow (example: mark a test failed → create defect)

1. SPA calls `POST /api/v1/test-results/{id}/execute` with `{status: "Failed"}`.
2. Edge nginx proxies to backend; `get_current_user` validates the JWT.
3. `qa_service.execute_result` updates the result, transitions the run to
   `in_progress`, and writes an audit row — all in one transaction.
4. SPA calls `POST /api/v1/projects/{pid}/defects` with `test_result_id` set.
5. `require_project_access` confirms membership (admins bypass), then
   `qa_service.create_defect` validates the linked result, assigns `BUG-00n`, and
   records the link for traceability.

## Data model (v1 tables)

Identity: `organizations`, `roles`, `users`, `user_roles`.
Projects: `projects`, `project_members`.
QA: `test_cases`, `test_runs`, `test_results`, `defects`.
System: `audit_logs`, `integrations` (structure only).

Conventions:
- Internal primary keys are UUIDs.
- Human-readable keys are generated per scope: `PROJ-001`, `TC-001`, `RUN-001`, `BUG-001`.
- Important tables carry `organization_id`, `project_id` (where applicable),
  `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`.
- Soft deletes via `deleted_at` (queries filter it out).

### Traceability

`defects.test_result_id → test_results.id → (test_run_id, test_case_id)`.
A failed `test_result` can spawn a `defect`; the defect retains the link so the UI can
show Requirement→…→Defect lineage as later modules (requirements, releases) arrive.

### Indexes

Created in the initial migration for the hot paths: `users.email`,
`projects.organization_id`, `*.project_id` on QA tables, `defects.status`,
`defects.assignee_id`, `defects.test_result_id`, `audit_logs.actor_id`,
`audit_logs.created_at`.

## Frontend structure

- `layouts/` — `AuthLayout` (login), `WorkspaceLayout` (role-aware sidebar),
  `AdminLayout` (admin console chrome).
- `guards/` — `AuthGuard` (must be logged in), `RoleGuard` (admin-only subtree).
- `pages/` — one folder per area; each page is its own file.
- `services/` — all API calls go through `apiClient.ts`; no scattered `fetch`.
- `routes/AppRoutes.tsx` — the single routing table wiring guards to layouts to pages.

## Scaling posture (not built now, not blocked)

- Backend is stateless (JWT, no server-side session store) → horizontally scalable;
  nginx `proxy_pass` can target multiple replicas.
- Postgres and Redis are separate services → can become managed/external.
- Uploads use a named Docker volume in v1, designed to move to S3/MinIO later.
- Heavy reports can move to the (scaffolded) `workers/` background path.
