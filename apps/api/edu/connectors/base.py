import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from edu.db import SessionLocal
from edu.models import Account, Course, GradeItem, Task

logger = logging.getLogger("edu.connectors")

DONE_SOURCE_STATUSES = {"submitted", "graded", "completed"}


class ConnectorError(Exception):
    """Raised by connectors on any failure. The message is user-facing — never
    include tokens, passwords or OAuth codes in it."""


def upsert_course(
    session: Session,
    account: Account,
    *,
    external_id: str,
    name: str,
    code: str | None = None,
    url: str | None = None,
) -> Course:
    course = session.scalar(
        select(Course).where(Course.account_id == account.id, Course.external_id == external_id)
    )
    if course is None:
        course = Course(account_id=account.id, external_id=external_id, name=name)
        session.add(course)
    course.name = name[:200]
    course.code = code[:80] if code else None
    course.url = url
    session.flush()
    return course


def upsert_tasks(session: Session, course: Course, rows: list[dict]) -> None:
    """Upsert freshly synced tasks into a course by external_id.

    Each row: {external_id, kind, title, description, due_at, url,
               source_status, source_done (bool), grade, max_grade}

    Local `status` is preserved (rule 6) with one exception: a task the source
    reports as done auto-flips todo → done. Tasks gone from the source are kept
    (platforms hide old items); `dismissed` is the user's delete.
    """
    now = datetime.now(UTC)
    existing = {
        task.external_id: task
        for task in session.scalars(
            select(Task).where(Task.course_id == course.id, Task.external_id.is_not(None))
        )
    }
    for row in rows:
        task = existing.get(row["external_id"])
        if task is None:
            task = Task(course_id=course.id, external_id=row["external_id"], status="todo")
            session.add(task)
        task.kind = row["kind"]
        task.title = row["title"][:300]
        task.description = (row.get("description") or "")[:2000]
        task.url = row.get("url")
        task.due_at = row.get("due_at")
        task.source_status = row.get("source_status")
        task.grade = row.get("grade")
        task.max_grade = row.get("max_grade")
        task.synced_at = now
        if row.get("source_done") and task.status == "todo":
            task.status = "done"
            task.completed_at = now
    session.flush()


def replace_grades(session: Session, course: Course, rows: list[dict]) -> None:
    """Sync a course's grade items to exactly what the source reports.

    Unlike tasks, grades carry no local state — rows are upserted by
    external_id and rows gone from the source are deleted (gradebooks get
    restructured freely)."""
    now = datetime.now(UTC)
    existing = {
        item.external_id: item
        for item in session.scalars(select(GradeItem).where(GradeItem.course_id == course.id))
    }
    seen = set()
    for row in rows:
        seen.add(row["external_id"])
        item = existing.get(row["external_id"])
        if item is None:
            item = GradeItem(course_id=course.id, external_id=row["external_id"])
            session.add(item)
        item.name = row["name"][:300]
        item.kind = row["kind"]
        item.grade = row.get("grade")
        item.max_grade = row.get("max_grade")
        item.graded_at = row.get("graded_at")
        item.url = row.get("url")
        item.updated_at = now
    for external_id, item in existing.items():
        if external_id not in seen:
            session.delete(item)
    session.flush()


def run_sync_account(account_id: int) -> None:
    """Sync ONE account instance in its own session, recording status.

    Fail-soft by design: on error we keep last-good courses/tasks and surface
    the message via Account.last_error (rule 4 in CLAUDE.md).
    """
    from edu.connectors import SYNCERS

    with SessionLocal() as session:
        account = session.get(Account, account_id)
        if account is None:
            return
        connector = account.connector
        account.sync_status = "syncing"
        account.last_error = None
        session.commit()

        try:
            SYNCERS[connector](session, account)
            account.sync_status = "ok"
            account.last_sync_at = datetime.now(UTC)
            session.commit()
        except Exception as exc:  # noqa: BLE001 — connectors must never crash the app
            session.rollback()
            logger.warning("sync failed for %s #%s: %s", connector, account_id, exc)
            account = session.get(Account, account_id)
            if account is not None:
                account.sync_status = "error"
                account.last_error = str(exc)[:500]
                session.commit()


def run_sync(connector: str) -> None:
    """Sync every account of a connector type (scheduler entrypoint)."""
    with SessionLocal() as session:
        ids = list(session.scalars(select(Account.id).where(Account.connector == connector)))
    for account_id in ids:
        run_sync_account(account_id)
