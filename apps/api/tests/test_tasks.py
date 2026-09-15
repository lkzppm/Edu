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


def test_summary_counts_skip_exams():
    """Tests live in the Tests tab (2026-09-14) — the to-do counts ignore them."""
    from datetime import timedelta

    from edu.routes.tasks import _summary

    soon = datetime.now(UTC) + timedelta(days=2)
    tasks = [
        Task(kind="assignment", title="Lista 1", due_at=soon, status="todo"),
        Task(kind="exam", title="P1", due_at=soon, status="todo"),
    ]
    assert _summary(tasks).due_week == 1


def test_manual_test_is_an_exam_and_deletable(session, account):
    """A hand-added test (2026-09-14) is kind=exam with no external_id — the
    Tests tab picks it up, and DELETE treats it as user-owned, not synced."""
    from fastapi.testclient import TestClient

    from edu.db import get_db
    from edu.main import app

    course = make_course(session, account)
    app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(app)
        bad = client.post("/tasks", json={"title": "P1", "kind": "exam", "course_id": course.id})
        assert bad.status_code == 422  # a test needs a date
        res = client.post(
            "/tasks",
            json={
                "title": "P1",
                "kind": "exam",
                "course_id": course.id,
                "due_at": "2026-10-28T23:59",
            },
        )
        assert res.status_code == 201
        assert res.json()["kind"] == "exam"
        assert client.delete(f"/tasks/{res.json()['id']}").status_code == 200
    finally:
        app.dependency_overrides.clear()
