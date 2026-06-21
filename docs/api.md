# TrackQA — API Reference (v1)

Base path: `/api/v1`. All responses are JSON. Errors use:

```json
{ "error": { "code": "string", "message": "human readable", "request_id": "uuid" } }
```

API docs are available only in development mode (`ENVIRONMENT=development`). Disabled in production.

Authentication: send `Authorization: Bearer <access_token>` on every protected route.

## Auth

| Method | Path                | Auth | Body / Notes |
|--------|---------------------|------|--------------|
| POST   | `/auth/login`       | no   | form fields `username` (email), `password`. Returns access + refresh tokens. |
| POST   | `/auth/refresh`     | no   | `{ "refresh_token": "..." }` → new access token. |
| GET    | `/auth/me`          | yes  | Current user, roles, `is_admin`. |

## Projects

| Method | Path                       | Auth | Notes |
|--------|----------------------------|------|-------|
| GET    | `/projects/`               | yes  | Projects the caller can access (admins: all in org). |
| POST   | `/projects/`               | yes  | `{ "name", "description" }`. Caller becomes project MANAGER. |
| GET    | `/projects/{project_id}`   | yes  | Requires project access. |
| GET    | `/projects/{project_id}/report` | yes | Execution + defect summary. |

## Test Cases

| Method | Path                                      | Auth | Notes |
|--------|-------------------------------------------|------|-------|
| GET    | `/projects/{project_id}/test-cases`       | yes  | List. |
| POST   | `/projects/{project_id}/test-cases`       | yes  | `{ title, description?, preconditions?, steps?, expected_result?, priority? }` |

## Test Runs & Execution

| Method | Path                                      | Auth | Notes |
|--------|-------------------------------------------|------|-------|
| GET    | `/projects/{project_id}/test-runs`        | yes  | List runs. |
| POST   | `/projects/{project_id}/test-runs`        | yes  | `{ name, test_case_ids[] }`. Empty list ⇒ all project cases. Seeds `Untested` results. |
| GET    | `/test-runs/{run_id}`                     | yes  | Run detail incl. results. |
| POST   | `/test-results/{result_id}/execute`       | yes  | `{ status, comment? }`. status ∈ Untested, Passed, Failed, Blocked, Skipped, Retest. |

## Defects

| Method | Path                                      | Auth | Notes |
|--------|-------------------------------------------|------|-------|
| GET    | `/projects/{project_id}/defects`          | yes  | List. |
| POST   | `/projects/{project_id}/defects`          | yes  | `{ title, description?, severity?, assignee_id?, test_result_id? }`. Link to a failed result for traceability. |
| PATCH  | `/defects/{defect_id}`                    | yes  | `{ status?, severity?, assignee_id? }`. status validated against defect workflow. |

## Admin (admin role required for all)

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/admin/users`             | List users with roles. |
| POST   | `/admin/users`             | `{ email, full_name, password, role_keys[] }`. |
| GET    | `/admin/roles`             | Available system roles. |
| GET    | `/admin/audit-logs`        | Recent audit activity (`?limit=`). |
| GET    | `/admin/integrations`      | Configured integrations (structure only in v1). |

## System

| Method | Path             | Notes |
|--------|------------------|-------|
| GET    | `/health`        | Liveness. |
| GET    | `/api/v1/health` | Liveness (API-prefixed). |

## Workflow statuses

- Test case: `Draft → Ready → Approved → Deprecated`
- Execution result: `Untested, Passed, Failed, Blocked, Skipped, Retest`
- Defect: `Open → Triaged → Assigned → In Progress → Resolved → Retest → Closed / Rejected`

## Example: end-to-end with curl

```bash
BASE=https://localhost/api/v1
# 1. login
TOKEN=$(curl -sk -X POST $BASE/auth/login \
  -d "username=admin@example.com&password=YOURPASS" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
auth=(-H "Authorization: Bearer $TOKEN")

# 2. project
PID=$(curl -sk "${auth[@]}" -H 'Content-Type: application/json' \
  -X POST $BASE/projects/ -d '{"name":"Checkout","description":"Payments"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 3. test case
TC=$(curl -sk "${auth[@]}" -H 'Content-Type: application/json' \
  -X POST $BASE/projects/$PID/test-cases -d '{"title":"Pay with card"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 4. run (all cases)
RID=$(curl -sk "${auth[@]}" -H 'Content-Type: application/json' \
  -X POST $BASE/projects/$PID/test-runs -d '{"name":"Sprint 1","test_case_ids":[]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 5. get the result id, mark Failed, raise a defect (see API schemas for full payloads)
```
