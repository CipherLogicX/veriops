"""Project business logic."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.exceptions import NotFoundError
from app.models.project import Project, ProjectMember
from app.models.identity import Role, UserRole
from app.services import audit, keys


def list_projects(db: Session, current: CurrentUser) -> list[Project]:
    allowed_org_roles = {
        "SUPER_ADMIN",
                "PROJECT_MANAGER",
        "QA_LEAD",
        "TESTER",
        "VIEWER",
    }

    stmt = select(Project).where(
        Project.organization_id == current.organization_id,
        Project.deleted_at.is_(None),
    )

    db_role_keys = set(db.execute(
        select(Role.key)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current.id)
    ).scalars())

    if current.is_admin or db_role_keys.intersection(allowed_org_roles):
        return list(db.execute(stmt.order_by(Project.created_at.desc())).scalars())

    stmt = stmt.join(
        ProjectMember, ProjectMember.project_id == Project.id
    ).where(ProjectMember.user_id == current.id)

    return list(db.execute(stmt.order_by(Project.created_at.desc())).scalars())


def get_project(db: Session, current: CurrentUser, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise NotFoundError("Project not found.")
    return project


def create_project(db: Session, current: CurrentUser, name: str, description: str | None) -> Project:
    project = Project(
        organization_id=current.organization_id,
        key=keys.next_project_key(db),
        name=name,
        description=description,
        created_by=current.id,
        updated_by=current.id,
    )
    db.add(project)
    db.flush()

    # Creator becomes a project manager member automatically.
    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=current.id,
            project_role="PROJECT_MANAGER",
        )
    )
    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="project.create",
        entity_type="project",
        entity_id=project.key,
        detail={"name": name},
    )
    db.commit()
    db.refresh(project)
    return project
