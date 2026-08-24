from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from edu.db import get_db
from edu.models import Course, Task
from edu.schemas import CourseOut, CourseUpdateRequest

router = APIRouter()


def _out(session: Session, course: Course) -> CourseOut:
    pending = (
        session.scalar(
            select(func.count(Task.id)).where(Task.course_id == course.id, Task.status == "todo")
        )
        or 0
    )
    return CourseOut(
        id=course.id,
        account_id=course.account_id,
        connector=course.account.connector,
        name=course.name,
        code=course.code,
        url=course.url,
        hidden=course.hidden,
        pending=pending,
    )


@router.get("", response_model=list[CourseOut])
def list_courses(session: Session = Depends(get_db)) -> list[CourseOut]:
    courses = session.scalars(
        select(Course).options(joinedload(Course.account)).order_by(Course.account_id, Course.id)
    ).all()
    return [_out(session, c) for c in courses]


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int, body: CourseUpdateRequest, session: Session = Depends(get_db)
) -> CourseOut:
    course = session.get(Course, course_id, options=[joinedload(Course.account)])
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    course.hidden = body.hidden
    session.commit()
    return _out(session, course)
