"""Atomic human-readable key generation.

Uses a key_counters table with row-level locking. The advisory transaction lock
protects first-row creation for a new scope.
"""
import uuid

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.system import KeyCounter


def _scope(value: uuid.UUID | str | None) -> str:
    return "global" if value is None else str(value)


def _next(db: Session, prefix: str, scope_value: uuid.UUID | str | None = None) -> str:
    scope = _scope(scope_value)
    lock_key = f"key_counter:{scope}:{prefix}"

    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": lock_key},
    )

    counter = db.execute(
        select(KeyCounter)
        .where(KeyCounter.scope == scope, KeyCounter.prefix == prefix)
        .with_for_update()
    ).scalar_one_or_none()

    if counter is None:
        counter = KeyCounter(scope=scope, prefix=prefix, next_value=1)
        db.add(counter)
        db.flush()

    value = counter.next_value
    counter.next_value += 1

    return f"{prefix}-{value:03d}"


def next_project_key(db: Session) -> str:
    return _next(db, "PROJ")


def next_test_case_key(db: Session, project_id: uuid.UUID) -> str:
    return _next(db, "TC", project_id)


def next_test_run_key(db: Session, project_id: uuid.UUID) -> str:
    return _next(db, "RUN", project_id)


def next_defect_key(db: Session, project_id: uuid.UUID) -> str:
    return _next(db, "BUG", project_id)
