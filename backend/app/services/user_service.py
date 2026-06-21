"""User management with privilege escalation prevention and session revocation."""
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.exceptions import ConflictError, NotFoundError, PermissionError_
from app.core.permissions import enforce_role_assignment, caller_level, ROLE_BY_KEY
from app.core.security import hash_password, validate_password_strength
from app.models.identity import Role, User, UserRole
from app.services import audit


def list_users(db: Session, current: CurrentUser) -> list[User]:
    return list(db.execute(
        select(User).where(
            User.organization_id == current.organization_id,
            User.deleted_at.is_(None),
        ).order_by(User.created_at.desc())
    ).scalars())


def get_user_roles(db: Session, user_id) -> list[str]:
    return list(db.execute(
        select(Role.key).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    ).scalars())


def create_user(db: Session, current: CurrentUser, data) -> User:
    # Privilege escalation check
    enforce_role_assignment(current.role_keys, data.role_keys)

    existing = db.execute(select(User).where(User.email == data.email.lower())).scalar_one_or_none()
    if existing:
        raise ConflictError("A user with this email already exists.")

    errors = validate_password_strength(data.password)
    if errors:
        from app.core.exceptions import AppError
        class ValidationError(AppError):
            status_code = 422
            code = "validation_error"
        raise ValidationError("; ".join(errors))

    user = User(
        organization_id=current.organization_id,
        email=data.email.lower(),
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    for key in data.role_keys:
        role = db.execute(select(Role).where(Role.key == key)).scalar_one_or_none()
        if not role:
            raise NotFoundError(f"Role not found: {key}")
        db.add(UserRole(user_id=user.id, role_id=role.id))

    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="user.create", entity_type="user", entity_id=data.email,
                 detail={"roles": data.role_keys})
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, current: CurrentUser, user_id, data) -> User:
    user = db.execute(
        select(User).where(User.id == user_id, User.organization_id == current.organization_id, User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found.")

    # Prevent self-role-modification
    if str(user_id) == str(current.id) and data.role_keys is not None:
        raise PermissionError_("You cannot modify your own roles.")

    if data.role_keys is not None:
        enforce_role_assignment(current.role_keys, data.role_keys)

    if data.full_name is not None:
        user.full_name = data.full_name

    if data.is_active is not None:
        # Prevent disabling last SUPER_ADMIN
        if not data.is_active and "SUPER_ADMIN" in get_user_roles(db, user_id):
            active_supers = db.execute(
                select(User).join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .where(Role.key == "SUPER_ADMIN", User.is_active == True, User.deleted_at.is_(None))
            ).scalars().all()
            if len(active_supers) <= 1:
                raise PermissionError_("Cannot disable the last active SUPER_ADMIN.")
        user.is_active = data.is_active
        if not data.is_active:
            # Revoke all sessions on disable
            from app.services.auth_service import revoke_all_user_sessions
            revoke_all_user_sessions(db, user.id)

    if data.password:
        errors = validate_password_strength(data.password)
        if errors:
            from app.core.exceptions import AppError
            class ValidationError(AppError):
                status_code = 422
                code = "validation_error"
            raise ValidationError("; ".join(errors))
        user.hashed_password = hash_password(data.password)
        from app.services.auth_service import revoke_all_user_sessions
        revoke_all_user_sessions(db, user.id)

    if data.role_keys is not None:
        db.execute(delete(UserRole).where(UserRole.user_id == user.id))
        for key in data.role_keys:
            role = db.execute(select(Role).where(Role.key == key)).scalar_one_or_none()
            if not role:
                raise NotFoundError(f"Role not found: {key}")
            db.add(UserRole(user_id=user.id, role_id=role.id))

    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="user.update", entity_type="user", entity_id=user.email,
                 detail={"is_active": data.is_active, "password_changed": bool(data.password), "roles": data.role_keys})
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, current: CurrentUser, user_id) -> None:
    if str(user_id) == str(current.id):
        raise PermissionError_("You cannot delete your own account.")

    user = db.execute(
        select(User).where(User.id == user_id, User.organization_id == current.organization_id, User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found.")

    # Prevent deleting last SUPER_ADMIN
    if "SUPER_ADMIN" in get_user_roles(db, user_id):
        active_supers = db.execute(
            select(User).join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.key == "SUPER_ADMIN", User.is_active == True, User.deleted_at.is_(None))
        ).scalars().all()
        if len(active_supers) <= 1:
            raise PermissionError_("Cannot delete the last active SUPER_ADMIN.")

    from app.services.auth_service import revoke_all_user_sessions
    revoke_all_user_sessions(db, user.id)
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="user.delete", entity_type="user", entity_id=user.email)
    db.commit()
