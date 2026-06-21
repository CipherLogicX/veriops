"""Test management routes: suites, cases, runs, execution, defects, attachments, CSV."""
import csv
import io
import mimetypes
import os
import secrets
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    CurrentUser, get_current_user,
    require_project_access, require_project_write_test,
    require_project_execute, require_project_defect_write,
)
from app.core.exceptions import NotFoundError, PermissionError_
from app.models.qa import Attachment, Defect, TestCase, TestResult, TestRun, TestSuite
from app.models.identity import User
from app.schemas import (
    AttachmentOut, DefectCreate, DefectDetailOut, DefectOut, DefectUpdate,
    ExecuteResultIn, SuiteCreate, SuiteOut, SuiteUpdate,
    TestCaseCreate, TestCaseUpdate, TestCaseOut, TestResultOut,
    TestRunCreate, TestRunDetailOut, TestRunOut,
)
from app.services import audit, qa_service

router = APIRouter(tags=["test-management"])

UPLOAD_DIR = Path("/app/uploads")
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf", ".txt", ".log", ".csv"}
BLOCKED_EXTENSIONS = {".exe", ".sh", ".bat", ".cmd", ".js", ".html", ".php", ".py", ".jar", ".zip"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _check_attachment(upload: UploadFile) -> None:
    ext = Path(upload.filename or "").suffix.lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(422, f"File type '{ext}' is not allowed.")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(422, f"File type '{ext}' is not permitted. Allowed: {sorted(ALLOWED_EXTENSIONS)}")


# ── Suites ────────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/suites", response_model=list[SuiteOut])
def list_suites(project_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    return qa_service.list_suites(db, project_id)


@router.post("/projects/{project_id}/suites", response_model=SuiteOut, status_code=201)
def create_suite(project_id: uuid.UUID, data: SuiteCreate,
                 db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    require_project_write_test(project_id, current, db)
    return qa_service.create_suite(db, current, project_id, data)


@router.patch("/suites/{suite_id}", response_model=SuiteOut)
def update_suite(suite_id: uuid.UUID, data: SuiteUpdate,
                 db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    suite = db.get(TestSuite, suite_id)
    if not suite or suite.organization_id != current.organization_id:
        raise NotFoundError("Suite not found.")
    require_project_write_test(suite.project_id, current, db)
    return qa_service.update_suite(db, current, suite_id, data)


@router.delete("/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    suite = db.get(TestSuite, suite_id)
    if not suite or suite.organization_id != current.organization_id:
        raise NotFoundError("Suite not found.")
    require_project_write_test(suite.project_id, current, db)
    qa_service.delete_suite(db, current, suite_id)
    return Response(status_code=204)


# ── Test Cases ────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/test-cases", response_model=list[TestCaseOut])
def list_test_cases(
    project_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user),
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
    search: str | None = None, suite_id: uuid.UUID | None = None,
):
    require_project_access(project_id, current, db)
    return qa_service.list_test_cases(db, project_id, skip=skip, limit=limit, search=search, suite_id=suite_id)


@router.post("/projects/{project_id}/test-cases", response_model=TestCaseOut, status_code=201)
def create_test_case(project_id: uuid.UUID, data: TestCaseCreate,
                     db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    require_project_write_test(project_id, current, db)
    return qa_service.create_test_case(db, current, project_id, data)


@router.patch("/test-cases/{tc_id}", response_model=TestCaseOut)
def update_test_case(tc_id: uuid.UUID, data: TestCaseUpdate,
                     db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    tc = db.get(TestCase, tc_id)
    if not tc or tc.deleted_at is not None or tc.organization_id != current.organization_id:
        raise NotFoundError("Test case not found.")
    require_project_access(tc.project_id, current, db)
    require_project_write_test(tc.project_id, current, db)

    suite_id = getattr(data, "suite_id", None)
    if suite_id is not None:
        suite = db.get(TestSuite, suite_id)
        if (
            not suite
            or suite.deleted_at is not None
            or suite.organization_id != current.organization_id
            or suite.project_id != tc.project_id
        ):
            raise NotFoundError("Suite not found in this project.")

    for f in ("title", "description", "preconditions", "steps", "expected_result", "priority", "suite_id", "status"):
        if getattr(data, f, None) is not None:
            setattr(tc, f, getattr(data, f))

    tc.updated_by = current.id
    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="test_case.update",
        entity_type="test_case",
        entity_id=tc.key,
    )
    db.commit()
    db.refresh(tc)
    return tc

@router.delete("/test-cases/{tc_id}", status_code=204)
def delete_test_case(tc_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    from datetime import datetime, timezone
    tc = db.get(TestCase, tc_id)
    if not tc or tc.deleted_at is not None or tc.organization_id != current.organization_id:
        raise NotFoundError("Test case not found.")
    require_project_access(tc.project_id, current, db)
    require_project_write_test(tc.project_id, current, db)
    tc.deleted_at = datetime.now(timezone.utc); tc.updated_by = current.id
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="test_case.delete", entity_type="test_case", entity_id=tc.key)
    db.commit()
    return Response(status_code=204)


# ── CSV export ────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/test-cases/export.csv")
def export_test_cases(project_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    cases = qa_service.list_test_cases(db, project_id, limit=10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["key","title","priority","status","preconditions","steps","expected_result","description"])
    for tc in cases:
        def safe(v):
            if v and str(v)[:1] in ("=","+","-","@"):
                return "'" + str(v)
            return v or ""
        w.writerow([safe(tc.key), safe(tc.title), tc.priority, tc.status,
                    safe(tc.preconditions), safe(tc.steps), safe(tc.expected_result), safe(tc.description)])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=test-cases-{project_id}.csv"})


# ── CSV import ────────────────────────────────────────────────────────────────
@router.post("/projects/{project_id}/test-cases/import")
def import_test_cases(project_id: uuid.UUID, file: UploadFile = File(...),
                      db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    require_project_write_test(project_id, current, db)

    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(422, "Only CSV files are accepted for import.")

    content = file.file.read(5 * 1024 * 1024).decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    required_cols = {"title"}

    if not rows:
        return {"imported": 0, "errors": ["CSV is empty"]}

    cols = set(reader.fieldnames or [])
    if not required_cols.issubset(cols):
        raise HTTPException(422, f"CSV must have columns: {sorted(required_cols)}")

    from app.schemas import TestCaseCreate

    imported = 0
    errors = []

    for i, row in enumerate(rows):
        row_number = i + 2
        title = str(row.get("title", "")).strip()

        if not title:
            errors.append(f"Row {row_number}: title is required")
            continue

        for k, v in row.items():
            if v and str(v)[:1] in ("=", "+", "-", "@"):
                row[k] = "'" + str(v)

        try:
            with db.begin_nested():
                data = TestCaseCreate(
                    title=title[:255],
                    description=str(row.get("description", ""))[:2000] or None,
                    preconditions=str(row.get("preconditions", ""))[:2000] or None,
                    steps=str(row.get("steps", ""))[:5000] or None,
                    expected_result=str(row.get("expected_result", ""))[:2000] or None,
                    priority=str(row.get("priority", "medium")).lower() if row.get("priority") else "medium",
                )
                qa_service.create_test_case(db, current, project_id, data, commit=False)
            imported += 1
        except Exception:
            errors.append(f"Row {row_number}: import failed")

    db.commit()
    return {"imported": imported, "errors": errors[:20]}

@router.get("/projects/{project_id}/test-runs", response_model=list[TestRunOut])
def list_test_runs(project_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user),
                   skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    require_project_access(project_id, current, db)
    return qa_service.list_test_runs(db, project_id, skip=skip, limit=limit)


@router.post("/projects/{project_id}/test-runs", response_model=TestRunOut, status_code=201)
def create_test_run(project_id: uuid.UUID, data: TestRunCreate,
                    db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    require_project_write_test(project_id, current, db)
    return qa_service.create_test_run(db, current, project_id, data)


@router.get("/test-runs/{run_id}", response_model=TestRunDetailOut)
def get_test_run(run_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    run = qa_service.get_test_run(db, run_id)
    if run.organization_id != current.organization_id:
        raise NotFoundError("Test run not found.")
    require_project_access(run.project_id, current, db)
    results = qa_service.list_run_results(db, run_id)
    detail = TestRunDetailOut.model_validate(run)
    detail.results = [TestResultOut.model_validate(r) for r in results]
    return detail


@router.patch("/test-runs/{run_id}/complete", response_model=TestRunOut)
def complete_run(run_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    run = db.get(TestRun, run_id)
    if not run or run.deleted_at is not None or run.organization_id != current.organization_id:
        raise NotFoundError("Test run not found.")
    require_project_access(run.project_id, current, db)
    require_project_write_test(run.project_id, current, db)
    run.status = "completed"; run.updated_by = current.id
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="test_run.complete", entity_type="test_run", entity_id=run.key)
    db.commit(); db.refresh(run)
    return run


# ── Execution ─────────────────────────────────────────────────────────────────
@router.post("/test-results/{result_id}/execute", response_model=TestResultOut)
def execute_result(result_id: uuid.UUID, data: ExecuteResultIn,
                   db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    result = db.get(TestResult, result_id)
    if not result or result.organization_id != current.organization_id:
        raise NotFoundError("Test result not found.")
    require_project_access(result.project_id, current, db)
    require_project_execute(result.project_id, current, db)
    return qa_service.execute_result(db, current, result_id, data.status, data.comment)


# ── Defects ───────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/defects", response_model=list[DefectOut])
def list_defects(project_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user),
                 skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500), status: str | None = None):
    require_project_access(project_id, current, db)
    return qa_service.list_defects(db, project_id, skip=skip, limit=limit, status=status)


@router.post("/projects/{project_id}/defects", response_model=DefectOut, status_code=201)
def create_defect(project_id: uuid.UUID, data: DefectCreate,
                  db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    require_project_access(project_id, current, db)
    require_project_defect_write(project_id, current, db)
    return qa_service.create_defect(db, current, project_id, data)


@router.get("/defects/{defect_id}", response_model=DefectDetailOut)
def get_defect(defect_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    defect = db.get(Defect, defect_id)
    if not defect or defect.deleted_at is not None or defect.organization_id != current.organization_id:
        raise NotFoundError("Defect not found.")
    require_project_access(defect.project_id, current, db)

    assignee_name = None
    if defect.assignee_id:
        assignee = db.get(User, defect.assignee_id)
        if assignee and assignee.organization_id == current.organization_id:
            assignee_name = assignee.full_name or assignee.email

    test_case_key = None
    test_case_title = None
    test_run_key = None
    test_run_name = None

    if defect.test_result_id:
        result = db.get(TestResult, defect.test_result_id)
        if result and result.organization_id == current.organization_id and result.project_id == defect.project_id:
            test_case = db.get(TestCase, result.test_case_id)
            if test_case and test_case.organization_id == current.organization_id:
                test_case_key = test_case.key
                test_case_title = test_case.title

            test_run = db.get(TestRun, result.test_run_id)
            if test_run and test_run.organization_id == current.organization_id:
                test_run_key = test_run.key
                test_run_name = test_run.name

    return {
        "id": defect.id,
        "key": defect.key,
        "project_id": defect.project_id,
        "title": defect.title,
        "description": defect.description,
        "severity": defect.severity,
        "status": defect.status,
        "assignee_id": defect.assignee_id,
        "assignee_name": assignee_name,
        "test_result_id": defect.test_result_id,
        "test_case_key": test_case_key,
        "test_case_title": test_case_title,
        "test_run_key": test_run_key,
        "test_run_name": test_run_name,
        "created_at": defect.created_at,
        "updated_at": defect.updated_at,
    }


@router.patch("/defects/{defect_id}", response_model=DefectOut)
def update_defect(defect_id: uuid.UUID, data: DefectUpdate,
                  db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    defect = db.get(Defect, defect_id)
    if not defect or defect.deleted_at is not None or defect.organization_id != current.organization_id:
        raise NotFoundError("Defect not found.")
    require_project_access(defect.project_id, current, db)
    require_project_defect_write(defect.project_id, current, db)
    return qa_service.update_defect(db, current, defect_id, data)


@router.delete("/defects/{defect_id}", status_code=204)
def delete_defect(defect_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    from datetime import datetime, timezone
    defect = db.get(Defect, defect_id)
    if not defect or defect.deleted_at is not None or defect.organization_id != current.organization_id:
        raise NotFoundError("Defect not found.")
    require_project_access(defect.project_id, current, db)
    require_project_defect_write(defect.project_id, current, db)
    defect.deleted_at = datetime.now(timezone.utc); defect.updated_by = current.id
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="defect.delete", entity_type="defect", entity_id=defect.key)
    db.commit()
    return Response(status_code=204)


# ── Attachments ───────────────────────────────────────────────────────────────
def _save_upload(upload: UploadFile, org_id: uuid.UUID, user_id: uuid.UUID,
                 test_case_id=None, test_result_id=None, defect_id=None,
                 db: Session = None, current: CurrentUser = None) -> Attachment:
    _check_attachment(upload)
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(413, "File exceeds 20 MB limit.")
    ext = Path(upload.filename or "").suffix.lower()
    stored = secrets.token_hex(24) + ext
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / stored).write_bytes(data)
    ct = upload.content_type or mimetypes.guess_type(upload.filename or "")[0] or "application/octet-stream"
    att = Attachment(
        organization_id=org_id, uploaded_by=user_id,
        test_case_id=test_case_id, test_result_id=test_result_id, defect_id=defect_id,
        original_filename=Path(upload.filename or "unknown").name[:255],
        stored_filename=stored, content_type=ct[:128], file_size=len(data),
    )
    db.add(att); db.commit(); db.refresh(att)
    audit.record(db, organization_id=org_id, actor_id=user_id,
                 action="attachment.upload", entity_type="attachment", entity_id=stored)
    return att


@router.post("/test-cases/{tc_id}/attachments", response_model=AttachmentOut, status_code=201)
def upload_to_test_case(tc_id: uuid.UUID, file: UploadFile = File(...),
                        db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    tc = db.get(TestCase, tc_id)
    if not tc or tc.organization_id != current.organization_id:
        raise NotFoundError("Test case not found.")
    require_project_access(tc.project_id, current, db)
    return _save_upload(file, current.organization_id, current.id, test_case_id=tc_id, db=db, current=current)


@router.post("/test-results/{result_id}/attachments", response_model=AttachmentOut, status_code=201)
def upload_to_result(result_id: uuid.UUID, file: UploadFile = File(...),
                     db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    result = db.get(TestResult, result_id)
    if not result or result.organization_id != current.organization_id:
        raise NotFoundError("Test result not found.")
    require_project_access(result.project_id, current, db)
    return _save_upload(file, current.organization_id, current.id, test_result_id=result_id, db=db, current=current)


@router.post("/defects/{defect_id}/attachments", response_model=AttachmentOut, status_code=201)
def upload_to_defect(defect_id: uuid.UUID, file: UploadFile = File(...),
                     db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    defect = db.get(Defect, defect_id)
    if not defect or defect.organization_id != current.organization_id:
        raise NotFoundError("Defect not found.")
    require_project_access(defect.project_id, current, db)
    return _save_upload(file, current.organization_id, current.id, defect_id=defect_id, db=db, current=current)


def _attachment_project_id(att: Attachment, db: Session) -> uuid.UUID:
    if att.test_case_id:
        tc = db.get(TestCase, att.test_case_id)
        if not tc or tc.deleted_at is not None:
            raise NotFoundError("Attachment target not found.")
        return tc.project_id

    if att.test_result_id:
        result = db.get(TestResult, att.test_result_id)
        if not result:
            raise NotFoundError("Attachment target not found.")
        return result.project_id

    if att.defect_id:
        defect = db.get(Defect, att.defect_id)
        if not defect or defect.deleted_at is not None:
            raise NotFoundError("Attachment target not found.")
        return defect.project_id

    raise NotFoundError("Attachment target not found.")


def _safe_attachment_filename(filename: str | None) -> str:
    clean = Path(filename or "attachment").name.replace("\r", "").replace("\n", "")
    return quote((clean or "attachment")[:255])


@router.get("/attachments/{att_id}/download")
def download_attachment(att_id: uuid.UUID, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    att = db.get(Attachment, att_id)
    if not att or att.organization_id != current.organization_id:
        raise NotFoundError("Attachment not found.")

    project_id = _attachment_project_id(att, db)
    require_project_access(project_id, current, db)

    path = UPLOAD_DIR / att.stored_filename
    if not path.is_file():
        raise HTTPException(404, "File not found on server.")

    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="attachment.download",
        entity_type="attachment",
        entity_id=str(att.id),
    )
    db.commit()

    filename = _safe_attachment_filename(att.original_filename)
    return FileResponse(
        path=path,
        media_type=att.content_type,
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )

