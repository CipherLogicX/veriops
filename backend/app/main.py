"""VeriOps FastAPI application."""
import logging, time, uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.api.v1 import api_router
from app.core.bootstrap import run_bootstrap
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import register_exception_handlers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("trackqa")

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL)

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json" if settings.docs_enabled else None,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"])

register_exception_handlers(app)

@app.middleware("http")
async def ctx(request: Request, call_next):
    rid = str(uuid.uuid4())
    request.state.request_id = rid
    t = time.time()
    resp = await call_next(request)
    ms = (time.time() - t) * 1000
    resp.headers.update({"X-Request-ID": rid, "X-Content-Type-Options": "nosniff",
                          "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin"})
    logger.info("method=%s path=%s status=%s ms=%.1f rid=%s",
                request.method, request.url.path, resp.status_code, ms, rid)
    return resp

@app.on_event("startup")
def startup():
    db = SessionLocal()
    try: run_bootstrap(db)
    except Exception: logger.exception("Bootstrap failed.")
    finally: db.close()

@app.get("/health", tags=["system"])
def health(): return {"status": "ok", "service": settings.APP_NAME}

@app.get("/ready", tags=["system"])
def ready():
    from app.core.database import engine
    with engine.connect() as conn:
        conn.execute(__import__("sqlalchemy").text("SELECT 1"))
    return {"status": "ready"}

@app.get(f"{settings.API_V1_PREFIX}/health", tags=["system"])
def api_health(): return {"status": "ok"}

@app.get(f"{settings.API_V1_PREFIX}/ready", tags=["system"])
def api_ready():
    from app.core.database import engine
    from sqlalchemy import text as sql_text
    with engine.connect() as conn:
        conn.execute(sql_text("SELECT 1"))
    return {"status": "ready"}

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
