"""Add atomic key counters and enforce corrected constraints.

Revision ID: 0004_key_counters_constraints
Revises: 0003_suites_attach_rt
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004_key_counters_constraints"
down_revision: Union[str, None] = "0003_suites_attach_rt"
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


def _drop_unique(table_name: str, constraint_name: str) -> None:
    with op.batch_alter_table(table_name) as batch:
        batch.drop_constraint(constraint_name, type_="unique")


def upgrade() -> None:
    op.create_table(
        "key_counters",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("scope", sa.String(128), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("next_value", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("scope", "prefix", name="uq_key_counters_scope_prefix"),
        *_ts(),
    )

    key_counters = sa.table(
        "key_counters",
        sa.column("id", UUID),
        sa.column("scope", sa.String),
        sa.column("prefix", sa.String),
        sa.column("next_value", sa.Integer),
    )

    bind = op.get_bind()
    seed_rows = []

    project_next = bind.execute(sa.text("""
        SELECT COALESCE(MAX((regexp_match(key, '^PROJ-([0-9]+)$'))[1]::int), 0) + 1 AS next_value
        FROM projects
        WHERE key ~ '^PROJ-[0-9]+$'
    """)).scalar_one()
    seed_rows.append({"id": uuid.uuid4(), "scope": "global", "prefix": "PROJ", "next_value": project_next})

    for table_name, prefix in (("test_cases", "TC"), ("test_runs", "RUN"), ("defects", "BUG")):
        rows = bind.execute(sa.text(f"""
            SELECT
                project_id::text AS scope,
                COALESCE(MAX((regexp_match(key, '^{prefix}-([0-9]+)$'))[1]::int), 0) + 1 AS next_value
            FROM {table_name}
            WHERE key ~ '^{prefix}-[0-9]+$'
            GROUP BY project_id
        """)).mappings().all()

        for row in rows:
            seed_rows.append({
                "id": uuid.uuid4(),
                "scope": row["scope"],
                "prefix": prefix,
                "next_value": int(row["next_value"]),
            })

    if seed_rows:
        op.bulk_insert(key_counters, seed_rows)

    op.create_index("ix_key_counters_scope_prefix", "key_counters", ["scope", "prefix"])

    _drop_unique("projects", "projects_key_key")
    _drop_unique("test_cases", "test_cases_key_key")
    _drop_unique("test_runs", "test_runs_key_key")
    _drop_unique("defects", "defects_key_key")

    op.create_check_constraint(
        "ck_attachment_exactly_one_target",
        "attachments",
        """
        (
            (test_case_id IS NOT NULL)::int +
            (test_result_id IS NOT NULL)::int +
            (defect_id IS NOT NULL)::int
        ) = 1
        """,
    )


def downgrade() -> None:
    op.drop_constraint("ck_attachment_exactly_one_target", "attachments", type_="check")

    with op.batch_alter_table("defects") as batch:
        batch.create_unique_constraint("defects_key_key", ["key"])
    with op.batch_alter_table("test_runs") as batch:
        batch.create_unique_constraint("test_runs_key_key", ["key"])
    with op.batch_alter_table("test_cases") as batch:
        batch.create_unique_constraint("test_cases_key_key", ["key"])
    with op.batch_alter_table("projects") as batch:
        batch.create_unique_constraint("projects_key_key", ["key"])

    op.drop_index("ix_key_counters_scope_prefix", table_name="key_counters")
    op.drop_table("key_counters")
