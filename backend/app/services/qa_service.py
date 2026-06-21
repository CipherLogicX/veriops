"""QA workflow service: suites, test cases, runs, execution, defects, reports."""
import uuid
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.exceptions import ConflictError, NotFoundError
from app.models.qa import Attachment, Defect, TestCase, TestResult, TestRun, TestSuite
from app.models.identity import User
from app.models.project import ProjectMember
from app.schemas import ProjectReport
from app.services import audit, keys

VALID_RESULT_STATUSES = {"Untested", "Passed", "Failed", "Blocked"}
VALID_DEFECT_STATUSES = {"Open",   "In Progress", "Resolved", "Retest", "Closed",}


# ── Suites ───────────────────────────────────────────────────────────────────
def list_suites(db: Session, project_id: uuid.UUID) -> list[TestSuite]:
    return list(db.execute(
        select(TestSuite).where(TestSuite.project_id == project_id, TestSuite.deleted_at.is_(None))
        .order_by(TestSuite.sort_order, TestSuite.name)
    ).scalars())


def create_suite(db: Session, current: CurrentUser, project_id: uuid.UUID, data) -> TestSuite:
    if data.parent_id:
        parent = db.get(TestSuite, data.parent_id)
        if not parent or parent.project_id != project_id:
            raise NotFoundError("Parent suite not found in this project.")
    suite = TestSuite(
        organization_id=current.organization_id, project_id=project_id,
        parent_id=data.parent_id, name=data.name, description=data.description,
        sort_order=data.sort_order or 0,
        created_by=current.id, updated_by=current.id,
    )
    db.add(suite)
    db.flush()
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="suite.create", entity_type="test_suite", entity_id=str(suite.id))
    db.commit(); db.refresh(suite)
    return suite


def update_suite(db: Session, current: CurrentUser, suite_id: uuid.UUID, data) -> TestSuite:
    suite = db.get(TestSuite, suite_id)
    if not suite or suite.deleted_at is not None or suite.organization_id != current.organization_id:
        raise NotFoundError("Suite not found.")
    if data.name is not None: suite.name = data.name
    if data.description is not None: suite.description = data.description
    if data.sort_order is not None: suite.sort_order = data.sort_order
    suite.updated_by = current.id
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="suite.update", entity_type="test_suite", entity_id=str(suite.id))
    db.commit(); db.refresh(suite)
    return suite


def delete_suite(db: Session, current: CurrentUser, suite_id: uuid.UUID) -> None:
    from datetime import datetime, timezone
    suite = db.get(TestSuite, suite_id)
    if not suite or suite.deleted_at is not None or suite.organization_id != current.organization_id:
        raise NotFoundError("Suite not found.")
    suite.deleted_at = datetime.now(timezone.utc); suite.updated_by = current.id
    # Un-assign test cases in this suite
    from sqlalchemy import update as sql_update
    db.execute(sql_update(TestCase).where(TestCase.suite_id == suite_id).values(suite_id=None))
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="suite.delete", entity_type="test_suite", entity_id=str(suite.id))
    db.commit()


# ── Test Cases ───────────────────────────────────────────────────────────────
def list_test_cases(db, project_id, skip=0, limit=100, search=None, suite_id=None):
    q = select(TestCase).where(TestCase.project_id == project_id, TestCase.deleted_at.is_(None))
    if search:
        q = q.where(TestCase.title.ilike(f"%{search}%"))
    if suite_id:
        q = q.where(TestCase.suite_id == suite_id)
    return list(db.execute(q.order_by(TestCase.created_at.desc()).offset(skip).limit(limit)).scalars())


def create_test_case(db: Session, current: CurrentUser, project_id: uuid.UUID, data, commit: bool = True) -> TestCase:
    if getattr(data, "suite_id", None):
        suite = db.get(TestSuite, data.suite_id)
        if not suite or suite.deleted_at is not None or suite.project_id != project_id:
            raise NotFoundError("Suite not found in this project.")

    tc = TestCase(
        organization_id=current.organization_id,
        project_id=project_id,
        suite_id=getattr(data, "suite_id", None),
        key=keys.next_test_case_key(db, project_id),
        title=data.title,
        description=data.description,
        preconditions=data.preconditions,
        steps=data.steps,
        expected_result=data.expected_result,
        priority=data.priority,
        status=getattr(data, "status", None) or "Draft",
        created_by=current.id,
        updated_by=current.id,
    )
    db.add(tc)
    db.flush()

    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="test_case.create",
        entity_type="test_case",
        entity_id=tc.key,
    )

    if commit:
        db.commit()
        db.refresh(tc)

    return tc

def list_test_runs(db, project_id, skip=0, limit=100):
    runs = list(db.execute(
        select(TestRun).where(TestRun.project_id == project_id, TestRun.deleted_at.is_(None))
        .order_by(TestRun.created_at.desc()).offset(skip).limit(limit)
    ).scalars())

    if not runs:
        return runs

    run_ids = [r.id for r in runs]
    results = list(db.execute(
        select(TestResult, TestCase)
        .join(TestCase, TestCase.id == TestResult.test_case_id)
        .where(TestResult.test_run_id.in_(run_ids))
        .order_by(TestResult.created_at.asc())
    ).all())

    defects = list(db.execute(
        select(Defect).where(
            Defect.project_id == project_id,
            Defect.deleted_at.is_(None),
            Defect.test_result_id.is_not(None),
        )
    ).scalars())

    defect_by_result = {d.test_result_id: d for d in defects}
    results_by_run: dict[uuid.UUID, list[tuple[TestResult, TestCase]]] = {}

    for result, test_case in results:
        results_by_run.setdefault(result.test_run_id, []).append((result, test_case))

    def rollup(statuses: list[str]) -> str:
        if not statuses:
            return "Untested"
        if any(x == "Failed" for x in statuses):
            return "Failed"
        if any(x == "Blocked" for x in statuses):
            return "Blocked"
        if all(x == "Passed" for x in statuses):
            return "Passed"
        if all(x == "Untested" for x in statuses):
            return "Untested"
        return "In Progress"

    inline_by_run = {}

    for run_id, items in results_by_run.items():
        if len(items) == 1:
            result, test_case = items[0]
            linked = defect_by_result.get(result.id)
            inline_by_run[run_id] = {
                "test_result_id": result.id,
                "test_case_key": test_case.key,
                "test_case_title": test_case.title,
                "current_result": result.status,
                "linked_defect_key": linked.key if linked else None,
                "linked_defect_id": linked.id if linked else None,
            }
            continue

        statuses = [result.status for result, _ in items]
        inline_by_run[run_id] = {
            "test_result_id": None,
            "test_case_key": None,
            "test_case_title": f"{len(items)} cases",
            "current_result": rollup(statuses),
            "linked_defect_key": None,
            "linked_defect_id": None,
        }

    for run in runs:
        inline = inline_by_run.get(run.id, {})
        for key, value in inline.items():
            setattr(run, key, value)

    return runs

def create_test_run(db: Session, current: CurrentUser, project_id: uuid.UUID, data) -> TestRun:
    run = TestRun(
        organization_id=current.organization_id, project_id=project_id,
        key=keys.next_test_run_key(db, project_id), name="Test Run",
        status="open", created_by=current.id, updated_by=current.id,
    )
    db.add(run); db.flush()

    case_ids = list(data.test_case_ids) if data.test_case_ids else []

    # Cross-project injection check
    if case_ids:
        valid_ids = set(db.execute(
            select(TestCase.id).where(
                TestCase.id.in_(case_ids),
                TestCase.project_id == project_id,
                TestCase.deleted_at.is_(None),
            )
        ).scalars())
        invalid = set(str(c) for c in case_ids) - set(str(v) for v in valid_ids)
        if invalid:
            raise ConflictError(f"Test case(s) not found in this project or are deleted: {', '.join(list(invalid)[:5])}")
        # Dedup
        case_ids = list(valid_ids)
    else:
        case_ids = list(db.execute(
            select(TestCase.id).where(TestCase.project_id == project_id, TestCase.deleted_at.is_(None))
        ).scalars())

    if len(case_ids) == 1:
        tc = db.get(TestCase, case_ids[0])
        if tc:
            run.name = tc.title or tc.key
    else:
        run.name = f"{len(case_ids)} Test Cases"


    # Prevent duplicate test cases in same run
    seen = set()
    for cid in case_ids:
        if cid in seen:
            continue
        seen.add(cid)
        db.add(TestResult(
            organization_id=current.organization_id, project_id=project_id,
            test_run_id=run.id, test_case_id=cid, status="Untested",
            created_by=current.id, updated_by=current.id,
        ))

    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="test_run.create", entity_type="test_run", entity_id=run.key,
                 detail={"cases": len(seen)})
    db.commit(); db.refresh(run)
    return run


def get_test_run(db: Session, run_id: uuid.UUID) -> TestRun:
    run = db.get(TestRun, run_id)
    if not run or run.deleted_at is not None:
        raise NotFoundError("Test run not found.")
    return run


def list_run_results(db: Session, run_id: uuid.UUID) -> list[TestResult]:
    return list(db.execute(
        select(TestResult).where(TestResult.test_run_id == run_id).order_by(TestResult.created_at.asc())
    ).scalars())


def execute_result(db: Session, current: CurrentUser, result_id: uuid.UUID, status: str, comment: str | None) -> TestResult:
    if status not in VALID_RESULT_STATUSES:
        raise ConflictError(f"Invalid status: {status}")
    result = db.get(TestResult, result_id)
    if not result:
        raise NotFoundError("Test result not found.")
    result.status = status; result.comment = comment; result.updated_by = current.id
    run = db.get(TestRun, result.test_run_id)

    if run:
        statuses = list(
            db.execute(
                select(TestResult.status)
                .where(TestResult.test_run_id == run.id)
            ).scalars()
        )

        if statuses and all(x == "Untested" for x in statuses):
            run.status = "open"
        elif any(x == "Failed" for x in statuses):
            run.status = "failed"
        elif any(x == "Blocked" for x in statuses):
            run.status = "blocked"
        elif statuses and all(x == "Passed" for x in statuses):
            run.status = "completed"
        else:
            run.status = "in_progress"
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="test_result.execute", entity_type="test_result", entity_id=str(result.id),
                 detail={"status": status})
    db.commit(); db.refresh(result)
    return result


# ── Defects ──────────────────────────────────────────────────────────────────
def list_defects(db, project_id, skip=0, limit=100, status=None):
    q = select(Defect).where(Defect.project_id == project_id, Defect.deleted_at.is_(None))
    if status:
        q = q.where(Defect.status == status)
    return list(db.execute(q.order_by(Defect.created_at.desc()).offset(skip).limit(limit)).scalars())


def _validate_defect_assignee(db: Session, project_id: uuid.UUID, organization_id: uuid.UUID, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is None:
        return

    user = db.get(User, assignee_id)
    if not user or user.deleted_at is not None or not user.is_active or user.organization_id != organization_id:
        raise NotFoundError("Assignee not found.")

    member_id = db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == assignee_id,
        )
    ).scalar_one_or_none()

    if member_id is None:
        raise ConflictError("Assignee must be an active project member.")


def create_defect(db: Session, current: CurrentUser, project_id: uuid.UUID, data) -> Defect:
    if data.test_result_id:
        tr = db.get(TestResult, data.test_result_id)
        if not tr or tr.project_id != project_id:
            raise NotFoundError("Linked test result not found in this project.")

    _validate_defect_assignee(db, project_id, current.organization_id, data.assignee_id)

    defect = Defect(
        organization_id=current.organization_id,
        project_id=project_id,
        key=keys.next_defect_key(db, project_id),
        title=data.title,
        description=data.description,
        severity=data.severity,
        status="Open",
        assignee_id=data.assignee_id,
        test_result_id=data.test_result_id,
        created_by=current.id,
        updated_by=current.id,
    )
    db.add(defect)
    db.flush()

    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="defect.create",
        entity_type="defect",
        entity_id=defect.key,
    )

    db.commit()
    db.refresh(defect)
    return defect

def update_defect(db: Session, current: CurrentUser, defect_id: uuid.UUID, data) -> Defect:
    defect = db.get(Defect, defect_id)
    if not defect or defect.deleted_at is not None or defect.organization_id != current.organization_id:
        raise NotFoundError("Defect not found.")

    if data.status is not None:
        if data.status not in VALID_DEFECT_STATUSES:
            raise ConflictError(f"Invalid defect status: {data.status}")
        defect.status = data.status

    if data.severity is not None:
        defect.severity = data.severity

    if "assignee_id" in data.model_fields_set:
        _validate_defect_assignee(db, defect.project_id, current.organization_id, data.assignee_id)
        defect.assignee_id = data.assignee_id

    if getattr(data, "title", None):
        defect.title = data.title

    if getattr(data, "description", None) is not None:
        defect.description = data.description

    defect.updated_by = current.id

    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="defect.update",
        entity_type="defect",
        entity_id=defect.key,
    )

    db.commit()
    db.refresh(defect)
    return defect

def project_report(db: Session, project_id: uuid.UUID, project_key: str) -> ProjectReport:
    def count(model, *conds):
        return db.execute(
            select(func.count())
            .select_from(model)
            .where(model.project_id == project_id, *conds)
        ).scalar_one()

    total_test_cases = count(TestCase, TestCase.deleted_at.is_(None))
    total_test_runs = count(TestRun, TestRun.deleted_at.is_(None))

    latest_result_rows = db.execute(
        select(TestResult.test_case_id, TestResult.status)
        .join(TestRun, TestRun.id == TestResult.test_run_id)
        .where(
            TestResult.project_id == project_id,
            TestRun.deleted_at.is_(None),
        )
        .order_by(TestResult.test_case_id, TestResult.updated_at.desc(), TestResult.created_at.desc())
    ).all()

    latest_by_case: dict[uuid.UUID, str] = {}
    for test_case_id, status in latest_result_rows:
        if test_case_id not in latest_by_case:
            latest_by_case[test_case_id] = status

    status_counts = {
        "Passed": 0,
        "Failed": 0,
        "Blocked": 0,
        "Untested": 0,
    }

    active_case_ids = db.execute(
        select(TestCase.id)
        .where(TestCase.project_id == project_id, TestCase.deleted_at.is_(None))
    ).scalars().all()

    for test_case_id in active_case_ids:
        status = latest_by_case.get(test_case_id, "Untested")
        if status not in status_counts:
            status = "Untested"
        status_counts[status] += 1

    sev_rows = db.execute(
        select(Defect.severity, func.count())
        .where(Defect.project_id == project_id, Defect.deleted_at.is_(None))
        .group_by(Defect.severity)
    ).all()

    open_statuses = ("Open", "In Progress", "Retest")

    return ProjectReport(
        project_id=project_id,
        project_key=project_key,
        total_test_cases=total_test_cases,
        total_test_runs=total_test_runs,
        results_passed=status_counts["Passed"],
        results_failed=status_counts["Failed"],
        results_blocked=status_counts["Blocked"],
        results_untested=status_counts["Untested"],
        open_defects=db.execute(
            select(func.count()).select_from(Defect).where(
                Defect.project_id == project_id,
                Defect.status.in_(open_statuses),
                Defect.deleted_at.is_(None),
            )
        ).scalar_one(),
        closed_defects=db.execute(
            select(func.count()).select_from(Defect).where(
                Defect.project_id == project_id,
                Defect.status.in_(("Closed", "Resolved")),
                Defect.deleted_at.is_(None),
            )
        ).scalar_one(),
        defects_by_severity={severity: count for severity, count in sev_rows},
    )
