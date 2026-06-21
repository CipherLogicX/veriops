"""Restrict test case status workflow.

Revision ID: 0005_test_case_status_workflow
Revises: 0004_key_counters_constraints
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_test_case_status_workflow"
down_revision: Union[str, None] = "0004_key_counters_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_test_cases_status",
        "test_cases",
        "status IN ('Draft', 'Ready', 'Approved')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_test_cases_status", "test_cases", type_="check")
