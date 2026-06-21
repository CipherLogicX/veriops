"""Pydantic schemas."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; email: EmailStr; full_name: str; is_active: bool; organization_id: uuid.UUID


class MeOut(UserOut):
    roles: list[str] = []; is_admin: bool = False


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    role_keys: list[str] = Field(default_factory=list)

    @field_validator("password")
    @classmethod
    def strong(cls, v):
        from app.core.security import validate_password_strength
        errs = validate_password_strength(v)
        if errs: raise ValueError("; ".join(errs))
        return v


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    key: str | None = Field(default=None, max_length=32)
    status: str = "Active"


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; key: str; name: str; description: str | None; status: str; created_at: datetime


# ── Suites ────────────────────────────────────────────────────────────────────
class SuiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class SuiteUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    sort_order: int | None = None


class SuiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; project_id: uuid.UUID; parent_id: uuid.UUID | None
    name: str; description: str | None; sort_order: int; created_at: datetime


# ── Test Cases ────────────────────────────────────────────────────────────────
TEST_CASE_STATUSES = {"Draft", "Ready", "Approved"}


class TestCaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    preconditions: str | None = None
    steps: str | None = None
    expected_result: str | None = None
    priority: str = "medium"
    suite_id: uuid.UUID | None = None
    status: str | None = None

    @field_validator("priority")
    @classmethod
    def vp(cls, v):
        if v.lower() not in {"low","medium","high","critical"}:
            raise ValueError("Invalid priority")
        return v.lower()

    @field_validator("status")
    @classmethod
    def vs(cls, v):
        if v is None:
            return v
        if v not in TEST_CASE_STATUSES:
            raise ValueError("Invalid test case status")
        return v


class TestCaseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    preconditions: str | None = None
    steps: str | None = None
    expected_result: str | None = None
    priority: str | None = None
    suite_id: uuid.UUID | None = None
    status: str | None = None

    @field_validator("priority")
    @classmethod
    def vp(cls, v):
        if v is None:
            return v
        if v.lower() not in {"low","medium","high","critical"}:
            raise ValueError("Invalid priority")
        return v.lower()

    @field_validator("status")
    @classmethod
    def vs(cls, v):
        if v is None:
            return v
        if v not in TEST_CASE_STATUSES:
            raise ValueError("Invalid test case status")
        return v


class TestCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; key: str; project_id: uuid.UUID; suite_id: uuid.UUID | None
    title: str; description: str | None; preconditions: str | None
    steps: str | None; expected_result: str | None; priority: str; status: str; created_at: datetime


class TestRunCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    test_case_ids: list[uuid.UUID] = Field(default_factory=list)


class TestResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; test_run_id: uuid.UUID; test_case_id: uuid.UUID; status: str; comment: str | None


class TestRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; key: str; project_id: uuid.UUID; name: str; status: str; created_at: datetime
    test_result_id: uuid.UUID | None = None
    test_case_key: str | None = None
    test_case_title: str | None = None
    current_result: str | None = None
    linked_defect_key: str | None = None
    linked_defect_id: uuid.UUID | None = None


class TestRunDetailOut(TestRunOut):
    results: list[TestResultOut] = []


class ExecuteResultIn(BaseModel):
    status: str; comment: str | None = None

    @field_validator("status")
    @classmethod
    def vs(cls, v):
        if v not in {"Untested","Passed","Failed","Blocked"}: raise ValueError("Invalid status")
        return v


# ── Defects ───────────────────────────────────────────────────────────────────
class DefectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    severity: str = "medium"
    assignee_id: uuid.UUID | None = None
    test_result_id: uuid.UUID | None = None

    @field_validator("severity")
    @classmethod
    def vsev(cls, v):
        if v.lower() not in {"low","medium","high","critical"}: raise ValueError("Invalid severity")
        return v.lower()


class DefectUpdate(BaseModel):
    status: str | None = None
    severity: str | None = None
    assignee_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None


class DefectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; key: str; project_id: uuid.UUID; title: str; description: str | None
    severity: str; status: str; assignee_id: uuid.UUID | None; test_result_id: uuid.UUID | None; created_at: datetime


class DefectDetailOut(DefectOut):
    assignee_name: str | None = None
    test_case_key: str | None = None
    test_case_title: str | None = None
    test_run_key: str | None = None
    test_run_name: str | None = None
    updated_at: datetime | None = None


# ── Attachments ───────────────────────────────────────────────────────────────
class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; original_filename: str; content_type: str; file_size: int; created_at: datetime


# ── Reports ───────────────────────────────────────────────────────────────────
class ProjectReport(BaseModel):
    project_id: uuid.UUID; project_key: str
    total_test_cases: int; total_test_runs: int
    results_passed: int; results_failed: int; results_blocked: int; results_untested: int
    open_defects: int; closed_defects: int; defects_by_severity: dict[str, int]


# ── Admin ─────────────────────────────────────────────────────────────────────
class IntegrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID; provider: str; name: str; is_enabled: bool


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None = None
    actor_email: str | None = None
    action: str
    entity_type: str
    entity_id: str | None
    detail: dict | None = None
    created_at: datetime


# ── AI ────────────────────────────────────────────────────────────────────────
class AIGenerateRequest(BaseModel):
    requirements: str = Field(min_length=10, max_length=20000)
    context: str | None = None
    count: int = Field(default=5, ge=1, le=20)
    test_type_preferences: list[str] = Field(default_factory=list)


class AIGeneratedTestCase(BaseModel):
    title: str; preconditions: str | None; steps: str; expected_result: str
    priority: str; severity: str = "medium"
    test_type: str  # positive, negative, boundary, security, performance


class AIGenerateResponse(BaseModel):
    test_cases: list[AIGeneratedTestCase]
    coverage_notes: str | None = None
    ai_model: str


class Page(BaseModel):
    total: int; page: int; page_size: int; items: list[Any]
