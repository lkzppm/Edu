from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from edu.config import get_settings
from edu.db import get_db
from edu.models import Course, Task
from edu.schemas import ManualTaskRequest, TaskOut, TasksResponse, TasksSummary, TaskUpdateRequest

router = APIRouter()

STATUSES = ("todo", "done", "dismissed")


def _out(task: Task) -> TaskOut:
    course = task.course
    return TaskOut(
        id=task.id,
        course_id=task.course_id,
        course_name=course.name if course else None,
        course_code=course.code if course else None,
        connector=course.account.connector if course else None,
        kind=task.kind,
        title=task.title,
        description=task.description,
        url=task.url,
        due_at=task.due_at.isoformat() if task.due_at else None,
        source_status=task.source_status,
        grade=str(task.grade) if task.grade is not None else None,
        max_grade=str(task.max_grade) if task.max_grade is not None else None,
        status=task.status,
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
    )


def _summary(tasks: list[Task]) -> TasksSummary:
    now = datetime.now(UTC)
    local_now = now.astimezone(ZoneInfo(get_settings().timezone))
    day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    day_end = day_start + timedelta(days=1)
    week_end = day_start + timedelta(days=7)
    todo = [t for t in tasks if t.status == "todo" and t.due_at is not None]
    return TasksSummary(
        overdue=sum(1 for t in todo if t.due_at < now),
        due_today=sum(1 for t in todo if day_start <= t.due_at < day_end and t.due_at >= now),
        due_week=sum(1 for t in todo if now <= t.due_at < week_end),
        done_week=sum(
            1
            for t in tasks
            if t.status == "done" and t.completed_at and now - t.completed_at < timedelta(days=7)
        ),
    )


@router.get("", response_model=TasksResponse)
def list_tasks(course_id: int | None = None, session: Session = Depends(get_db)) -> TasksResponse:
    """All non-dismissed tasks (hidden courses excluded); the client filters
    and groups. Summary counts use the display timezone's day boundaries."""
    query = (
        select(Task)
        .options(joinedload(Task.course).joinedload(Course.account))
        .outerjoin(Course, Task.course_id == Course.id)
        .where(Task.status != "dismissed", (Course.hidden.is_(False)) | (Task.course_id.is_(None)))
        .order_by(Task.due_at.asc().nulls_last(), Task.id)
    )
    if course_id is not None:
        query = query.where(Task.course_id == course_id)
    tasks = list(session.scalars(query))
    return TasksResponse(summary=_summary(tasks), tasks=[_out(t) for t in tasks])


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: ManualTaskRequest, session: Session = Depends(get_db)) -> TaskOut:
    due_at = None
    if body.due_at:
        try:
            due_at = datetime.fromisoformat(body.due_at)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid due_at datetime") from exc
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=ZoneInfo(get_settings().timezone))
    if body.course_id is not None and session.get(Course, body.course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    task = Task(
        course_id=body.course_id,
        external_id=None,
        kind="manual",
        title=body.title.strip(),
        description=body.description.strip(),
        due_at=due_at,
    )
    session.add(task)
    session.commit()
    return _out(task)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int, body: TaskUpdateRequest, session: Session = Depends(get_db)
) -> TaskOut:
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {STATUSES}")
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = body.status
    task.completed_at = datetime.now(UTC) if body.status == "done" else None
    session.commit()
    return _out(task)


@router.delete("/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_db)):
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.kind != "manual":
        raise HTTPException(status_code=409, detail="Synced tasks are dismissed, not deleted")
    session.delete(task)
    session.commit()
    return {"status": "deleted"}
