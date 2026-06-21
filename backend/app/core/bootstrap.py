"""Idempotent bootstrap: roles, default org, and the first admin user."""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import SYSTEM_ROLES
from app.core.security import hash_password, validate_password_strength
from app.models.identity import Organization, Role, User, UserRole

logger = logging.getLogger("trackqa")


def _slugify(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")[:120]


def seed_roles(db: Session) -> None:
    for r in SYSTEM_ROLES:
        existing = db.execute(select(Role).where(Role.key == r.key)).scalar_one_or_none()
        if not existing:
            db.add(Role(key=r.key, name=r.name, is_admin=r.is_admin))
    db.commit()


def ensure_default_org(db: Session) -> Organization:
    org = db.execute(select(Organization)).scalars().first()
    if org:
        return org
    org = Organization(name=settings.DEFAULT_ORG_NAME, slug=_slugify(settings.DEFAULT_ORG_NAME))
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def ensure_first_admin(db: Session, org: Organization) -> None:
    if not settings.FIRST_ADMIN_EMAIL or not settings.FIRST_ADMIN_PASSWORD:
        logger.warning("FIRST_ADMIN_EMAIL/PASSWORD not set; skipping first-admin bootstrap.")
        return

    # Validate password strength even for bootstrap admin
    errors = validate_password_strength(settings.FIRST_ADMIN_PASSWORD)
    if errors and settings.ENVIRONMENT == "production":
        logger.error("FIRST_ADMIN_PASSWORD is too weak: %s", "; ".join(errors))
        raise ValueError("FIRST_ADMIN_PASSWORD does not meet strength requirements.")

    email = settings.FIRST_ADMIN_EMAIL.lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        return

    admin = User(
        organization_id=org.id,
        email=email,
        full_name=settings.FIRST_ADMIN_NAME,
        hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
        is_active=True,
    )
    db.add(admin)
    db.flush()

    super_admin = db.execute(select(Role).where(Role.key == "SUPER_ADMIN")).scalar_one()
    db.add(UserRole(user_id=admin.id, role_id=super_admin.id))
    db.commit()
    logger.info("Bootstrapped first admin: %s", email)


def run_bootstrap(db: Session) -> None:
    seed_roles(db)
    org = ensure_default_org(db)
    ensure_first_admin(db, org)
