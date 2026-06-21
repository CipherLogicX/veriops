"""Authentication with server-side refresh token tracking and revocation."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthError
from app.core.security import create_access_token, verify_password
from app.models.auth import RefreshToken
from app.models.identity import Role, User, UserRole

CONCURRENT_REFRESH_GRACE_SECONDS = 10


class ConcurrentRefreshError(AuthError):
    pass



def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _make_refresh(user_id: uuid.UUID, family_id: uuid.UUID, user_agent: str | None, ip: str | None) -> tuple[str, RefreshToken]:
    """Create a raw refresh token string + DB record (hashed)."""
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    record = RefreshToken(
        user_id=user_id,
        family_id=family_id,
        token_hash=_hash_token(raw),
        expires_at=expires,
        user_agent=user_agent,
        ip_address=ip,
    )
    return raw, record


def authenticate(
    db: Session, email: str, password: str, user_agent: str | None = None, ip: str | None = None
) -> tuple[str, str]:
    """Return (access_token, refresh_token_raw) or raise AuthError."""
    user = db.execute(select(User).where(User.email == email.lower())).scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        raise AuthError("Invalid email or password.")
    if not user.is_active:
        raise AuthError("This account is disabled.")

    role_keys = list(db.execute(
        select(Role.key).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)
    ).scalars())

    access = create_access_token(str(user.id), {"roles": role_keys})
    family_id = uuid.uuid4()
    raw_refresh, rt_record = _make_refresh(user.id, family_id, user_agent, ip)
    db.add(rt_record)
    db.commit()
    return access, raw_refresh


def rotate_refresh(
    db: Session, raw_token: str, user_agent: str | None = None, ip: str | None = None
) -> tuple[str, str]:
    """Validate old refresh token, revoke it, issue new pair. Detects real reuse attacks."""
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)

    record = db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    ).scalar_one_or_none()

    if record is None:
        raise AuthError("Invalid refresh token.")

    if record.revoked_at is not None:
        age = (now - record.revoked_at).total_seconds()
        same_user_agent = not record.user_agent or record.user_agent == user_agent
        same_ip = not record.ip_address or record.ip_address == ip

        if age <= CONCURRENT_REFRESH_GRACE_SECONDS and same_user_agent and same_ip:
            raise ConcurrentRefreshError("Refresh token was already rotated. Retry with the current session.")

        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == record.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise AuthError("Refresh token reuse detected. All sessions revoked. Please log in again.")

    if record.expires_at < now:
        raise AuthError("Refresh token has expired. Please log in again.")

    record.revoked_at = now
    db.flush()

    user = db.get(User, record.user_id)
    if not user or not user.is_active:
        db.commit()
        raise AuthError("User not found or inactive.")

    role_keys = list(db.execute(
        select(Role.key).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)
    ).scalars())

    access = create_access_token(str(user.id), {"roles": role_keys})
    raw_new, rt_new = _make_refresh(user.id, record.family_id, user_agent, ip)
    db.add(rt_new)
    db.commit()
    return access, raw_new

def revoke_token(db: Session, raw_token: str) -> None:
    """Revoke a single refresh token (logout)."""
    token_hash = _hash_token(raw_token)
    record = db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).scalar_one_or_none()
    if record and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()


def revoke_all_user_sessions(db: Session, user_id: uuid.UUID) -> None:
    """Revoke all refresh tokens for a user (password change, admin disable)."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.commit()
