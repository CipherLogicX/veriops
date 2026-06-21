"""Auth routes: login, refresh (cookie), logout, me."""
import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.exceptions import AuthError
from app.models.identity import User
from app.schemas import MeOut
from app.services import audit, auth_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

_COOKIE = "trackqa_refresh"
_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE, value=token, max_age=_MAX_AGE,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        path="/api/v1/auth",
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(
        key=_COOKIE, path="/api/v1/auth",
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
    )


@router.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    ua = request.headers.get("user-agent", "")[:512]
    ip = request.client.host if request.client else None
    access, refresh = auth_service.authenticate(db, form.username, form.password, ua, ip)
    _set_cookie(response, refresh)

    user = db.execute(select(User).where(User.email == form.username.lower())).scalar_one_or_none()
    if user:
        audit.record(db, organization_id=user.organization_id, actor_id=user.id,
                     action="auth.login", entity_type="user", entity_id=user.email,
                     detail={"ip": ip})
    return {"access_token": access, "token_type": "bearer"}


@router.post("/refresh")
@limiter.limit("60/minute")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(_COOKIE, "")
    if not raw:
        raise AuthError("No session. Please log in.")
    ua = request.headers.get("user-agent", "")[:512]
    ip = request.client.host if request.client else None
    try:
        access, new_refresh = auth_service.rotate_refresh(db, raw, ua, ip)
    except auth_service.ConcurrentRefreshError:
        raise
    except AuthError:
        _clear_cookie(response)
        raise
    _set_cookie(response, new_refresh)
    return {"access_token": access, "token_type": "bearer"}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response,
           current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = request.cookies.get(_COOKIE, "")
    if raw:
        auth_service.revoke_token(db, raw)
    _clear_cookie(response)
    audit.record(db, organization_id=current.organization_id, actor_id=current.id,
                 action="auth.logout", entity_type="user", entity_id=current.email)
    return Response(status_code=204)


@router.get("/me", response_model=MeOut)
def me(current: CurrentUser = Depends(get_current_user)):
    return MeOut(
        id=current.id, email=current.email, full_name=current.full_name,
        is_active=True, organization_id=current.organization_id,
        roles=sorted(current.role_keys), is_admin=current.is_admin,
    )
