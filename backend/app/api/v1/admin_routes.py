"""Admin Console routes — users, roles, audit logs, integrations."""
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin, require_super_admin
from app.models.identity import Role, User
from app.models.system import AuditLog, Integration
from app.schemas import AuditLogOut, Page, IntegrationOut, MeOut, UserCreate, UserOut
from app.services import user_service, audit as audit_svc

router = APIRouter(prefix="/admin", tags=["admin"])


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=12)
    role_keys: list[str] | None = None
    is_active: bool | None = None


class IntegrationCreate(BaseModel):
    provider: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    notes: str | None = None


class IntegrationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    is_enabled: bool | None = None
    notes: str | None = None


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[MeOut])
def list_users(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    users = user_service.list_users(db, current)
    page = users[skip: skip + limit]
    out = []
    for u in page:
        roles = user_service.get_user_roles(db, u.id)
        out.append(MeOut(
            id=u.id, email=u.email, full_name=u.full_name, is_active=u.is_active,
            organization_id=u.organization_id, roles=roles,
            is_admin="SUPER_ADMIN" in roles,
        ))
    return out


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    return user_service.create_user(db, current, data)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    return user_service.update_user(db, current, user_id, data)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    user_service.delete_user(db, current, user_id)
    return Response(status_code=204)


# ── Roles ────────────────────────────────────────────────────────────────────

@router.get("/roles")
def list_roles(db: Session = Depends(get_db), current: CurrentUser = Depends(require_admin)):
    roles = db.execute(select(Role).order_by(Role.name)).scalars()
    return [{"key": r.key, "name": r.name, "is_admin": r.is_admin} for r in roles]


# ── Audit Logs ───────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=Page)
def list_audit_logs(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=10, le=100),
    action: str | None = None,
    entity_type: str | None = None,
):
    filters = [AuditLog.organization_id == current.organization_id]

    if action:
        filters.append(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)

    total = db.execute(
        select(func.count())
        .select_from(AuditLog)
        .where(*filters)
    ).scalar_one()

    offset = (page - 1) * page_size

    logs = db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    ).scalars().all()

    actor_ids = {log.actor_id for log in logs if log.actor_id}
    actors = {}
    if actor_ids:
        actors = {
            user.id: user
            for user in db.execute(select(User).where(User.id.in_(actor_ids))).scalars().all()
        }

    items = []
    for log in logs:
        item = AuditLogOut.model_validate(log)
        actor = actors.get(log.actor_id) if log.actor_id else None
        item.actor_name = actor.full_name if actor else "System Task"
        item.actor_email = actor.email if actor else "automated.internal"
        items.append(item)

    return Page(total=total, page=page, page_size=page_size, items=items)


# ── Integrations ─────────────────────────────────────────────────────────────

@router.get("/integrations", response_model=list[IntegrationOut])
def list_integrations(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    return list(db.execute(
        select(Integration).where(Integration.organization_id == current.organization_id)
    ).scalars())


@router.post("/integrations", response_model=IntegrationOut, status_code=201)
def create_integration(
    data: IntegrationCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    item = Integration(
        organization_id=current.organization_id,
        provider=data.provider,
        name=data.name,
        is_enabled=False,
        notes=data.notes,
    )
    db.add(item)
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="integration.create", entity_type="integration", entity_id=data.provider)
    db.commit(); db.refresh(item)
    return item


@router.patch("/integrations/{integration_id}", response_model=IntegrationOut)
def update_integration(
    integration_id: UUID,
    data: IntegrationUpdate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    from app.core.exceptions import NotFoundError
    item = db.get(Integration, integration_id)
    if not item or item.organization_id != current.organization_id:
        raise NotFoundError("Integration not found.")
    if data.name is not None:
        item.name = data.name
    if data.is_enabled is not None:
        item.is_enabled = data.is_enabled
    if data.notes is not None:
        item.notes = data.notes
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="integration.update", entity_type="integration", entity_id=item.provider)
    db.commit(); db.refresh(item)
    return item


@router.delete("/integrations/{integration_id}", status_code=204)
def delete_integration(
    integration_id: UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    from app.core.exceptions import NotFoundError
    item = db.get(Integration, integration_id)
    if not item or item.organization_id != current.organization_id:
        raise NotFoundError("Integration not found.")
    db.delete(item)
    audit_svc.record(db, organization_id=current.organization_id, actor_id=current.id,
                     action="integration.delete", entity_type="integration", entity_id=item.provider)
    db.commit()
    return Response(status_code=204)
