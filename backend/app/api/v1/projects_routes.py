"""Project management routes with YouTrack-style project membership access."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_admin
from app.core.exceptions import NotFoundError, PermissionError_
from app.core.permissions import VALID_PROJECT_ROLES
from app.models.identity import User
from app.models.project import Project, ProjectMember
from app.schemas import ProjectCreate, ProjectOut, ProjectReport
from app.services import qa_service, audit as audit_svc

router = APIRouter(prefix="/projects", tags=["projects"])


class StatusUpdate(BaseModel):
    status: str


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class MemberAdd(BaseModel):
    user_id: UUID
    project_role: str = "TESTER"


class MemberUpdate(BaseModel):
    project_role: str


def _safe_uuid(val: str):
    try:
        return UUID(str(val))
    except ValueError:
        return None


def _get_project(identifier: str, db: Session, current: CurrentUser) -> Project:
    uid = _safe_uuid(identifier)
    cond = (Project.id == uid) if uid else (Project.key == identifier.upper())
    proj = db.execute(
        select(Project).where(cond, Project.organization_id == current.organization_id, Project.deleted_at.is_(None))
    ).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "Project not found")
    return proj


def _project_role(project_id: UUID, current: CurrentUser, db: Session) -> str | None:
    member = db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == current.id)
    ).scalar_one_or_none()
    return member.project_role if member else None


def _require_project_access(project_id: UUID, current: CurrentUser, db: Session) -> str | None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return None
    role = _project_role(project_id, current, db)
    if role is None:
        raise PermissionError_("You do not have access to this project.")
    return role


def _require_project_role(project_id: UUID, current: CurrentUser, db: Session, allowed: set[str]) -> str | None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return None
    role = _project_role(project_id, current, db)
    if role not in allowed:
        raise PermissionError_("Insufficient project role.")
    return role


def _visible_project_ids(current: CurrentUser, db: Session) -> set[UUID] | None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return None
    rows = db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == current.id)
    ).scalars().all()
    return set(rows)


@router.post("", response_model=ProjectOut, status_code=201)
@router.post("/", response_model=ProjectOut, status_code=201, include_in_schema=False)
def create_project(data: ProjectCreate, db: Session = Depends(get_db), current: CurrentUser = Depends(require_admin)):
    key = (data.key or "").strip().upper() or data.name.strip().upper().replace(" ", "-")[:32]
    if db.execute(
        select(Project).where(Project.key == key, Project.organization_id == current.organization_id, Project.deleted_at.is_(None))
    ).scalar_one_or_none():
        raise HTTPException(409, "Project key already exists in this organisation")

    proj = Project(
        organization_id=current.organization_id,
        key=key,
        name=data.name.strip(),
        description=data.description,
        status=data.status or "Active",
        created_by=current.id,
        updated_by=current.id,
    )
    db.add(proj)
    db.flush()

    db.add(ProjectMember(project_id=proj.id, user_id=current.id, project_role="PROJECT_MANAGER"))

    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.create", entity_type="project", entity_id=proj.key)
    db.commit()
    db.refresh(proj)
    return proj


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user),
    skip: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000),
    search: str | None = None, status: str | None = None,
):
    visible = _visible_project_ids(current, db)
    q = select(Project).where(Project.organization_id == current.organization_id, Project.deleted_at.is_(None))
    if visible is not None:
        if not visible:
            return []
        q = q.where(Project.id.in_(visible))
    if search:
        q = q.where(Project.name.ilike(f"%{search}%") | Project.key.ilike(f"%{search}%"))
    if status:
        q = q.where(Project.status == status)
    return db.execute(q.order_by(Project.created_at.desc()).offset(skip).limit(limit)).scalars().all()


@router.get("/{project_identifier}", response_model=ProjectOut)
def get_project(project_identifier: str, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_access(proj.id, current, db)
    return proj


@router.patch("/{project_identifier}", response_model=ProjectOut)
def update_project(project_identifier: str, data: ProjectUpdate,
                   db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER"})
    if data.name is not None:
        proj.name = data.name.strip()
    if data.description is not None:
        proj.description = data.description
    proj.updated_by = current.id
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.update", entity_type="project", entity_id=proj.key)
    db.commit(); db.refresh(proj)
    return proj


@router.patch("/{project_identifier}/status", response_model=ProjectOut)
def update_project_status(project_identifier: str, data: StatusUpdate,
                          db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    allowed = {"Active", "Paused", "Completed", "Archived"}
    if data.status not in allowed:
        raise HTTPException(422, f"status must be one of {sorted(allowed)}")
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER", "QA_LEAD"})
    proj.status = data.status
    proj.updated_by = current.id
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.status_change", entity_type="project", entity_id=proj.key,
                     detail={"status": data.status})
    db.commit(); db.refresh(proj)
    return proj


@router.delete("/{project_identifier}", status_code=204)
def delete_project(project_identifier: str, db: Session = Depends(get_db), current: CurrentUser = Depends(require_admin)):
    from datetime import datetime, timezone
    proj = _get_project(project_identifier, db, current)
    proj.deleted_at = datetime.now(timezone.utc)
    proj.updated_by = current.id
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.delete", entity_type="project", entity_id=proj.key)
    db.commit()
    return Response(status_code=204)


@router.get("/{project_identifier}/report", response_model=ProjectReport)
def get_project_report(project_identifier: str, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_access(proj.id, current, db)
    return qa_service.project_report(db, proj.id, proj.key)


@router.get("/{project_identifier}/members")
def list_members(project_identifier: str, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_access(proj.id, current, db)

    rows = db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(
            ProjectMember.project_id == proj.id,
            User.deleted_at.is_(None),
            User.is_active.is_(True),
        )
        .order_by(User.email)
    ).all()

    return [
        {
            "user_id": str(m.user_id),
            "email": u.email,
            "full_name": u.full_name,
            "project_role": m.project_role,
        }
        for m, u in rows
    ]


@router.get("/{project_identifier}/available-users")
def list_available_users(project_identifier: str, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER"})

    users = db.execute(
        select(User).where(
            User.organization_id == proj.organization_id,
            User.deleted_at.is_(None),
            User.is_active.is_(True),
        ).order_by(User.email)
    ).scalars().all()

    return [{"id": str(u.id), "email": u.email, "full_name": u.full_name} for u in users]


@router.post("/{project_identifier}/members", status_code=201)
def add_member(project_identifier: str, data: MemberAdd,
               db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER"})

    if data.project_role not in VALID_PROJECT_ROLES:
        raise HTTPException(422, f"project_role must be one of {sorted(VALID_PROJECT_ROLES)}")

    target = db.get(User, data.user_id)
    if not target or target.deleted_at is not None:
        raise NotFoundError("Target user not found.")
    if target.organization_id != current.organization_id and not current.is_admin:
        raise PermissionError_("Cannot add users from a different organisation.")
    if not target.is_active:
        raise HTTPException(422, "Cannot add a disabled user to a project.")

    existing = db.execute(
        select(ProjectMember).where(ProjectMember.project_id == proj.id, ProjectMember.user_id == data.user_id)
    ).scalar_one_or_none()
    if existing:
        existing.project_role = data.project_role
    else:
        db.add(ProjectMember(project_id=proj.id, user_id=data.user_id, project_role=data.project_role))

    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.member_add", entity_type="project_member", entity_id=proj.key,
                     detail={"user_id": str(data.user_id), "role": data.project_role})
    db.commit()
    return {"user_id": str(data.user_id), "project_role": data.project_role}


@router.put("/{project_identifier}/members/{user_id}")
def update_member(project_identifier: str, user_id: UUID, data: MemberUpdate,
                  db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER"})

    if data.project_role not in VALID_PROJECT_ROLES:
        raise HTTPException(422, f"project_role must be one of {sorted(VALID_PROJECT_ROLES)}")

    member = db.execute(
        select(ProjectMember).where(ProjectMember.project_id == proj.id, ProjectMember.user_id == user_id)
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")

    member.project_role = data.project_role
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.member_update", entity_type="project_member", entity_id=proj.key,
                     detail={"user_id": str(user_id), "role": data.project_role})
    db.commit()
    return {"user_id": str(user_id), "project_role": data.project_role}


@router.delete("/{project_identifier}/members/{user_id}", status_code=204)
def remove_member(project_identifier: str, user_id: UUID,
                  db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)):
    proj = _get_project(project_identifier, db, current)
    _require_project_role(proj.id, current, db, {"PROJECT_MANAGER"})

    member = db.execute(
        select(ProjectMember).where(ProjectMember.project_id == proj.id, ProjectMember.user_id == user_id)
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")

    db.delete(member)
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="project.member_remove", entity_type="project_member", entity_id=proj.key,
                     detail={"user_id": str(user_id)})
    db.commit()
    return Response(status_code=204)
