"""The College tab's data: the class registry (from the cowork workspace),
work items, and the degree plan (data/degree_plan.yml — the editable source
of truth transcribed from the plano ECI)."""

from datetime import UTC, datetime
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from edu.db import get_db
from edu.models import ClassOverride, Course, SemesterClass, Task, WorkItem
from edu.schemas import ClassUpdateRequest

router = APIRouter()

PLAN_PATH = Path(__file__).resolve().parent.parent / "data" / "degree_plan.yml"

# Registry fields Edu may edit locally (2026-09-14 — the agent adding a
# professor's e-mail). Identity (code), plan fields (kind, period, anchor,
# flags) and the workspace path stay the mirror's.
EDITABLE = (
    "name",
    "turma",
    "credits",
    "professor",
    "contact",
    "evaluation",
    "platform",
    "platform_url",
    "links",
    "schedule",
)


def overrides_by_code(session: Session) -> dict[str, dict]:
    return {o.code: o.fields or {} for o in session.scalars(select(ClassOverride)).all()}


def class_display(session: Session) -> dict[str, str]:
    """class_code → canonical registry name (local edits applied). Platform
    courses linked to a class display the registry identity (a Classroom
    course named "Redes20262" reads as EEL878 · Redes de Computadores I
    everywhere)."""
    names = dict(session.execute(select(SemesterClass.code, SemesterClass.name)).all())
    for code, fields in overrides_by_code(session).items():
        if code in names and fields.get("name"):
            names[code] = fields["name"]
    return names


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


def _class_out(sc: SemesterClass, fields: dict) -> dict:
    """The mirror row with local edits layered on; `edited` names the keys
    that came from Edu rather than the workspace."""
    out = {
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
    }
    edited = [k for k in EDITABLE if k in fields]
    for key in edited:
        out[key] = fields[key]
    out["edited"] = edited
    return out


@router.get("")
def college(session: Session = Depends(get_db)) -> dict:
    classes = session.scalars(select(SemesterClass).order_by(SemesterClass.code)).all()
    overrides = overrides_by_code(session)
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
                **_class_out(sc, overrides.get(sc.code, {})),
                "course_id": getattr(course_by_code.get(sc.code), "id", None),
                "pending": pending.get(sc.code, 0),
                "work_items": by_class.get(sc.code, [])[:10],
            }
            for sc in classes
        ],
        "plan": load_plan(),
    }


@router.patch("/classes/{code}")
def update_class(code: str, body: ClassUpdateRequest, session: Session = Depends(get_db)) -> dict:
    """Edit a class's info locally. Only the fields sent change; `reset`
    lists keys whose edit is dropped (the workspace value shows again).
    Never touches the workspace or the mirror row (rule 6)."""
    code = code.strip().upper()
    sc = session.scalar(select(SemesterClass).where(SemesterClass.code == code))
    if sc is None:
        raise HTTPException(status_code=404, detail="Class not found")
    bad = [k for k in body.reset if k not in EDITABLE]
    if bad:
        raise HTTPException(status_code=422, detail=f"Not editable: {', '.join(bad)}")

    override = session.get(ClassOverride, code)
    fields = dict(override.fields) if override else {}
    for key in body.reset:
        fields.pop(key, None)
    for key, value in body.model_dump(exclude_unset=True, exclude={"reset"}).items():
        if value is not None:
            fields[key] = value

    if not fields:
        if override is not None:
            session.delete(override)
    elif override is None:
        session.add(ClassOverride(code=code, fields=fields))
    else:
        override.fields = fields
        override.updated_at = datetime.now(UTC)
    session.commit()
    return _class_out(sc, fields)
