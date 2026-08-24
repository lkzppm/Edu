"""The status rules from spec/data-model.md — 'local done survives sync' must
never regress."""

from datetime import UTC, datetime

from sqlalchemy import select

from edu.connectors.base import upsert_course, upsert_tasks
from edu.models import Task


def row(**overrides) -> dict:
    base = {
        "external_id": "assign:1",
        "kind": "assignment",
        "title": "Lista 1",
        "description": "",
        "due_at": datetime(2026, 9, 1, tzinfo=UTC),
        "url": None,
    }
    return {**base, **overrides}


def make_course(session, account):
    return upsert_course(session, account, external_id="42", name="Cálculo III", code="MAC238")


def test_upsert_is_idempotent_and_refreshes_fields(session, account):
    course = make_course(session, account)
    upsert_tasks(session, course, [row()])
    upsert_tasks(session, course, [row(title="Lista 1 (corrigida)")])
    tasks = list(session.scalars(select(Task)))
    assert len(tasks) == 1
    assert tasks[0].title == "Lista 1 (corrigida)"
    assert tasks[0].status == "todo"


def test_local_done_survives_sync(session, account):
    course = make_course(session, account)
    upsert_tasks(session, course, [row()])
    task = session.scalar(select(Task))
    task.status = "done"
    session.commit()

    upsert_tasks(session, course, [row()])  # source still says not done
    assert session.scalar(select(Task)).status == "done"


def test_dismissed_survives_sync(session, account):
    course = make_course(session, account)
    upsert_tasks(session, course, [row()])
    session.scalar(select(Task)).status = "dismissed"
    session.commit()

    upsert_tasks(session, course, [row(source_done=True)])
    assert session.scalar(select(Task)).status == "dismissed"


def test_source_done_flips_todo_to_done(session, account):
    course = make_course(session, account)
    upsert_tasks(session, course, [row()])
    assert session.scalar(select(Task)).status == "todo"

    upsert_tasks(session, course, [row(source_done=True, source_status="submitted")])
    task = session.scalar(select(Task))
    assert task.status == "done"
    assert task.completed_at is not None
    assert task.source_status == "submitted"


def test_vanished_tasks_are_kept(session, account):
    course = make_course(session, account)
    upsert_tasks(session, course, [row(), row(external_id="assign:2", title="Lista 2")])
    upsert_tasks(session, course, [row()])  # assign:2 gone from the source
    assert session.scalar(select(Task).where(Task.external_id == "assign:2")) is not None
