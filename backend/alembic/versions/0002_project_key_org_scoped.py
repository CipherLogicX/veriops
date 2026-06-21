"""
Revision ID: 0002_project_key_org_scoped
Revises: 0001_initial
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_project_key_org_scoped"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Project key: remove global unique, add composite unique (org_id, key)
    with op.batch_alter_table("projects") as batch:
        batch.create_unique_constraint("uq_projects_org_key", ["organization_id", "key"])

    # TestCase key: per-project unique
    with op.batch_alter_table("test_cases") as batch:
        batch.create_unique_constraint("uq_test_cases_project_key", ["project_id", "key"])

    # TestRun key: per-project unique
    with op.batch_alter_table("test_runs") as batch:
        batch.create_unique_constraint("uq_test_runs_project_key", ["project_id", "key"])

    # Defect key: per-project unique
    with op.batch_alter_table("defects") as batch:
        batch.create_unique_constraint("uq_defects_project_key", ["project_id", "key"])


def downgrade() -> None:
    with op.batch_alter_table("defects") as batch:
        batch.drop_constraint("uq_defects_project_key", type_="unique")
    with op.batch_alter_table("test_runs") as batch:
        batch.drop_constraint("uq_test_runs_project_key", type_="unique")
    with op.batch_alter_table("test_cases") as batch:
        batch.drop_constraint("uq_test_cases_project_key", type_="unique")
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("uq_projects_org_key", type_="unique")
