"""Add test_suites, attachments, refresh_tokens; fix key uniqueness; add indexes.

Revision ID: 0003_suites_attach_rt
Revises: 0002_project_key_org_scoped
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_suites_attach_rt"
down_revision: Union[str, None] = "0002_project_key_org_scoped"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _ts(*cols):
    return (
        *cols,
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def upgrade() -> None:
    # ── refresh_tokens ──────────────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", UUID, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        *_ts(),
    )
    op.create_index("ix_refresh_tokens_user", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_family", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_hash", "refresh_tokens", ["token_hash"], unique=True)

    # ── test_suites ─────────────────────────────────────────────────────────
    op.create_table(
        "test_suites",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", UUID, sa.ForeignKey("test_suites.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_test_suites_project", "test_suites", ["project_id"])
    op.create_index("ix_test_suites_parent", "test_suites", ["parent_id"])

    # ── test_cases: add suite_id column ─────────────────────────────────────
    op.add_column("test_cases", sa.Column("suite_id", UUID, sa.ForeignKey("test_suites.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_test_cases_suite", "test_cases", ["suite_id"])

    # ── test_results: add unique constraint run+case ─────────────────────────
    try:
        op.create_unique_constraint("uq_test_result_run_case", "test_results", ["test_run_id", "test_case_id"])
    except Exception:
        pass  # may already exist in clean installs

    # ── attachments ─────────────────────────────────────────────────────────
    op.create_table(
        "attachments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("uploaded_by", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("test_case_id", UUID, sa.ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=True),
        sa.Column("test_result_id", UUID, sa.ForeignKey("test_results.id", ondelete="CASCADE"), nullable=True),
        sa.Column("defect_id", UUID, sa.ForeignKey("defects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False, unique=True),
        sa.Column("content_type", sa.String(128), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        *_ts(),
    )
    op.create_index("ix_attachments_test_case", "attachments", ["test_case_id"])
    op.create_index("ix_attachments_result", "attachments", ["test_result_id"])
    op.create_index("ix_attachments_defect", "attachments", ["defect_id"])

    # ── Additional indexes for performance ──────────────────────────────────
    # audit_logs
    try:
        op.create_index("ix_audit_logs_org", "audit_logs", ["organization_id"])
    except Exception:
        pass


def downgrade() -> None:
    op.drop_table("attachments")
    op.drop_column("test_cases", "suite_id")
    op.drop_table("test_suites")
    op.drop_table("refresh_tokens")
