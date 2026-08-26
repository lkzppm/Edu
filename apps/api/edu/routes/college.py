"""The College tab's data: the class registry (from the cowork workspace),
work items, and the degree plan (data/degree_plan.yml — the editable source
of truth transcribed from the plano ECI)."""

from pathlib import Path

import yaml
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from edu.db import get_db
from edu.models import Course, SemesterClass, Task, WorkItem

router = APIRouter()

PLAN_PATH = Path(__file__).resolve().parent.parent / "data" / "degree_plan.yml"


def load_plan() -> dict:
    try:
        plan = yaml.safe_load(PLAN_PATH.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    credits = {"dispensada": 0, "em_curso": 0, "a_cursar": 0}
    counts = {"dispensada": 0, "em_curso": 0, "a_cursar": 0}
    for period in plan.get("curriculum", []):
        for course in period.get("courses", []):
            status = course.get("status")
            if status in credits:
                credits[status] += course.get("credits") or 0
                counts[status] += 1
    total = sum(credits.values())
    plan["summary"] = {
        "credits": credits,
        "counts": counts,
        "total_credits": total,
        "done_pct": round(credits["dispensada"] / total * 100, 1) if total else None,
    }
    return plan


def _work_item(item: WorkItem) -> dict:
    return {
        "date": item.date.date().isoformat() if item.date else None,
        "slug": item.slug,
        "title": item.title,
        "path": item.path,
        "files": item.files,
        "has_pdf": item.has_pdf,
    }


@router.get("")
def college(session: Session = Depends(get_db)) -> dict:
    classes = session.scalars(select(SemesterClass).order_by(SemesterClass.code)).all()
    items = session.scalars(select(WorkItem).order_by(WorkItem.date.desc())).all()
    by_class: dict[str, list[dict]] = {}
    for item in items:
        by_class.setdefault(item.class_code, []).append(_work_item(item))

    linked = session.scalars(select(Course).where(Course.class_code.is_not(None))).all()
    course_by_code = {c.class_code: c for c in linked}
    pending = dict(
        session.execute(
            select(Course.class_code, func.count(Task.id))
            .join(Task, Task.course_id == Course.id)
            .where(Course.class_code.is_not(None), Task.status == "todo")
            .group_by(Course.class_code)
        ).all()
    )

    return {
        "classes": [
            {
                "code": sc.code,
                "name": sc.name,
                "semester": sc.semester,
                "turma": sc.turma,
                "credits": sc.credits,
                "kind": sc.kind,
                "period": sc.period,
                "anchor": sc.anchor,
                "flags": sc.flags,
                "professor": sc.professor,
                "contact": sc.contact,
                "evaluation": sc.evaluation,
                "platform": sc.platform,
                "platform_url": sc.platform_url,
                "links": sc.links,
                "schedule": sc.schedule,
                "course_id": getattr(course_by_code.get(sc.code), "id", None),
                "pending": pending.get(sc.code, 0),
                "work_items": by_class.get(sc.code, [])[:10],
            }
            for sc in classes
        ],
        "plan": load_plan(),
    }
