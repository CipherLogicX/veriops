"""Configuration — all values from environment variables, no hardcoded secrets."""
import sys
from functools import lru_cache
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK = {"change-me-in-production","change_this_to_a_64_char_random_hex_string","secret","password","","trackqa"}
_WEAK_PW = {"admin123","Admin123","changeme","password","ChangeMe!2025Abc","change_this_admin_password",
             "change_this_strong_db_password","ChangeMe2025!"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "TrackQA"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    POSTGRES_USER: str = "trackqa"
    POSTGRES_PASSWORD: str = "trackqa"
    POSTGRES_DB: str = "trackqa"
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432

    @property
    def database_url(self) -> str:
        return (f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}")

    @property
    def sync_database_url(self) -> str:
        return self.database_url

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    FIRST_ADMIN_EMAIL: str = ""
    FIRST_ADMIN_PASSWORD: str = ""
    FIRST_ADMIN_NAME: str = "System Administrator"

    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            import json
            try:
                p = json.loads(v)
                if isinstance(p, list): return [o.strip() for o in p if o.strip()]
            except Exception: pass
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    REDIS_URL: str = "redis://redis:6379/0"
    DEFAULT_ORG_NAME: str = "Default Organization"

    # HTTPS / Cookie settings
    APP_BASE_URL: str = "http://localhost"
    COOKIE_SECURE: bool = False
    FORCE_HTTPS: bool = False

    @property
    def cookie_secure(self) -> bool:
        return self.COOKIE_SECURE or self.ENVIRONMENT == "production"

    # AI provider: local | disabled
    AI_PROVIDER: str = "local"

    # Local OpenAI-compatible AI runtime, e.g. llama.cpp server on the VM host.
    # This must be local-only in secure deployments. No external fallback.
    LOCAL_AI_BASE_URL: str = "http://host.docker.internal:8080/v1"
    LOCAL_AI_MODEL: str = "trackqa-qwen3-4b-q4"

    @property
    def ai_configured(self) -> bool:
        """Static check: provider has required credentials/URL set."""
        if self.AI_PROVIDER == "disabled":
            return False
        if self.AI_PROVIDER == "local":
            return bool(self.LOCAL_AI_BASE_URL and self.LOCAL_AI_MODEL)
        return False

    @property
    def ai_enabled(self) -> bool:
        """Runtime check: provider configured AND reachable.
        For Ollama: does a fast HTTP health check. Returns False if down.
        For OpenAI/Azure: returns True if key is set (network check at call time).
        """
        if not self.ai_configured:
            return False
        if self.AI_PROVIDER == "local":
            try:
                import urllib.request as ur
                base = self.LOCAL_AI_BASE_URL.rstrip("/")
                with ur.urlopen(f"{base}/models", timeout=2) as r:
                    return 200 <= r.status < 400
            except Exception:
                return False
        # For cloud providers, key presence is sufficient (failure handled at call time)
        return True

    @property
    def docs_enabled(self) -> bool:
        return self.ENVIRONMENT != "production"

    @model_validator(mode="after")
    def production_checks(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self
        errors = []
        if self.JWT_SECRET_KEY in _WEAK or len(self.JWT_SECRET_KEY) < 32:
            errors.append("JWT_SECRET_KEY is weak or default.")
        if self.POSTGRES_PASSWORD in _WEAK:
            errors.append("POSTGRES_PASSWORD is weak or default.")
        if self.FIRST_ADMIN_PASSWORD in _WEAK_PW:
            errors.append("FIRST_ADMIN_PASSWORD is a known-weak value.")
        if not self.FIRST_ADMIN_EMAIL:
            errors.append("FIRST_ADMIN_EMAIL is not set.")
        if self.DEBUG:
            errors.append("DEBUG=true is not allowed in production.")
        if "*" in self.CORS_ORIGINS:
            errors.append("CORS_ORIGINS cannot contain '*' in production.")
        if errors:
            print("FATAL: Production startup blocked:", file=sys.stderr)
            for e in errors: print(f"  - {e}", file=sys.stderr)
            sys.exit(1)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
