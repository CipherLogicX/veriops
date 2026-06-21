"""FastAPI auth dependencies and RBAC guards."""
import uuid
from dataclasses import dataclass, field

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthError, PermissionError_
from app.core.permissions import FULL_ADMIN_ROLE_KEYS, TC_WRITE_ROLES, TC_EXECUTE_ROLES, DEFECT_WRITE_ROLES
from app.models.identity import User, UserRole, Role
from app.models.project import ProjectMember

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login", auto_error=False)


@dataclass
class CurrentUser:
    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    full_name: str
    role_keys: set[str] = field(default_factory=set)

    @property
    def is_admin(self) -> bool:
        return bool(self.role_keys & FULL_ADMIN_ROLE_KEYS)

    @property
    def is_super_admin(self) -> bool:
        return "SUPER_ADMIN" in self.role_keys


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> CurrentUser:
    if not token:
        raise AuthError("Authentication required.")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise AuthError("Invalid token type.")
        user_id = payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired.")
    except jwt.PyJWTError:
        raise AuthError("Invalid authentication token.")

    user = db.get(User, uuid.UUID(user_id)) if user_id else None
    if not user or not user.is_active:
        raise AuthError("User not found or inactive.")

    role_keys = set(db.execute(
        select(Role.key).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)
    ).scalars())

    return CurrentUser(id=user.id, organization_id=user.organization_id,
                       email=user.email, full_name=user.full_name, role_keys=role_keys)


def require_admin(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current.is_admin:
        raise PermissionError_("Administrator privileges required.")
    return current


def require_super_admin(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current.is_super_admin:
        raise PermissionError_("Super-admin privileges required.")
    return current


def _get_project_role(project_id: uuid.UUID, current: CurrentUser, db: Session) -> str | None:
    m = db.execute(select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current.id,
    )).scalar_one_or_none()
    return m.project_role if m else None


def require_project_access(project_id: uuid.UUID, current: CurrentUser, db: Session) -> str | None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return None
    role = _get_project_role(project_id, current, db)
    if role is None:
        raise PermissionError_("You do not have access to this project.")
    return role


def require_project_write_test(project_id: uuid.UUID, current: CurrentUser, db: Session) -> None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return
    role = _get_project_role(project_id, current, db)
    if role not in TC_WRITE_ROLES:
        raise PermissionError_("QA Lead or Project Manager required to manage test cases.")


def require_project_execute(project_id: uuid.UUID, current: CurrentUser, db: Session) -> None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return
    role = _get_project_role(project_id, current, db)
    if role not in TC_EXECUTE_ROLES:
        raise PermissionError_("Tester role or higher required to execute tests.")


def require_project_defect_write(project_id: uuid.UUID, current: CurrentUser, db: Session) -> None:
    if current.is_admin or "PROJECT_MANAGER" in current.role_keys:
        return
    role = _get_project_role(project_id, current, db)
    if role not in DEFECT_WRITE_ROLES:
        raise PermissionError_("Tester role or higher required to manage defects.")
