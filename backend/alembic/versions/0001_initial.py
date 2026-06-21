"""initial schema

Revision ID: 0001_initial
Revises:
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB


def _ts(*cols):
    return (
        *cols,
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        *_ts(),
    )

    op.create_table(
        "roles",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("key", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
    )

    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "user_roles",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID, sa.ForeignKey("roles.id"), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
        *_ts(),
    )

    op.create_table(
        "projects",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_projects_org", "projects", ["organization_id"])

    op.create_table(
        "project_members",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_role", sa.String(32), nullable=False),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
        *_ts(),
    )
    op.create_index("ix_project_members_project", "project_members", ["project_id"])
    op.create_index("ix_project_members_user", "project_members", ["user_id"])

    op.create_table(
        "test_cases",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("preconditions", sa.Text(), nullable=True),
        sa.Column("steps", sa.Text(), nullable=True),
        sa.Column("expected_result", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(16), nullable=False, server_default="Draft"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_test_cases_project", "test_cases", ["project_id"])

    op.create_table(
        "test_runs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_test_runs_project", "test_runs", ["project_id"])

    op.create_table(
        "test_results",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("test_run_id", UUID, sa.ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("test_case_id", UUID, sa.ForeignKey("test_cases.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="Untested"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_test_results_project", "test_results", ["project_id"])
    op.create_index("ix_test_results_run", "test_results", ["test_run_id"])
    op.create_index("ix_test_results_case", "test_results", ["test_case_id"])

    op.create_table(
        "defects",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(16), nullable=False, server_default="Open"),
        sa.Column("assignee_id", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("test_result_id", UUID, sa.ForeignKey("test_results.id"), nullable=True),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_defects_project", "defects", ["project_id"])
    op.create_index("ix_defects_status", "defects", ["status"])
    op.create_index("ix_defects_assignee", "defects", ["assignee_id"])
    op.create_index("ix_defects_test_result", "defects", ["test_result_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("actor_id", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("detail", JSONB, nullable=True),
        *_ts(),
    )
    op.create_index("ix_audit_logs_actor", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_created", "audit_logs", ["created_at"])

    op.create_table(
        "integrations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_ts(),
    )


def downgrade() -> None:
    for t in [
        "integrations", "audit_logs", "defects", "test_results", "test_runs",
        "test_cases", "project_members", "projects", "user_roles", "users",
        "roles", "organizations",
    ]:
        op.drop_table(t)
