from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from edu.db import get_db
from edu.models import Course, GradeItem
from edu.schemas import CourseGradesOut, GradeItemOut, GradesResponse

router = APIRouter()


def _pct(grade: Decimal | None, max_grade: Decimal | None) -> float | None:
    if grade is None or not max_grade:
        return None
    return round(float(grade) / float(max_grade) * 100, 1)


def _out(item: GradeItem) -> GradeItemOut:
    return GradeItemOut(
        name=item.name,
        grade=str(item.grade) if item.grade is not None else None,
        max_grade=str(item.max_grade) if item.max_grade is not None else None,
        pct=_pct(item.grade, item.max_grade),
        graded_at=item.graded_at.isoformat() if item.graded_at else None,
        url=item.url,
    )


def _computed_total(items: list[GradeItem]) -> GradeItemOut | None:
    """Sum of graded items over their maxima — the fallback when the source has
    no (graded) course total."""
    graded = [i for i in items if i.grade is not None and i.max_grade]
    if not graded:
        return None
    grade = sum(i.grade for i in graded)
    max_grade = sum(i.max_grade for i in graded)
    return GradeItemOut(
        name="Total (partial)",
        grade=str(grade),
        max_grade=str(max_grade),
        pct=_pct(grade, max_grade),
        graded_at=None,
        url=None,
    )


@router.get("", response_model=GradesResponse)
def list_grades(session: Session = Depends(get_db)) -> GradesResponse:
    courses = session.scalars(
        select(Course)
        .options(joinedload(Course.account), joinedload(Course.grade_items))
        .where(Course.hidden.is_(False))
        .order_by(Course.account_id, Course.id)
    ).unique()
    out = []
    for course in courses:
        items = [i for i in course.grade_items if i.kind == "item"]
        if not items:
            continue
        source_total = next(
            (i for i in course.grade_items if i.kind == "total" and i.grade is not None), None
        )
        out.append(
            CourseGradesOut(
                course_id=course.id,
                course_name=course.name,
                course_code=course.code,
                connector=course.account.connector,
                total=_out(source_total) if source_total else _computed_total(items),
                items=[_out(i) for i in sorted(items, key=lambda i: (i.grade is None, i.id))],
            )
        )
    return GradesResponse(courses=out)
