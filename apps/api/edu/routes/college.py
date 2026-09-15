"""The College tab's data: the class registry (from the cowork workspace,
with Edu-local edits layered on), work items, and the degree plan (plan_*
tables — editable through the routes below and the agent; see edu/plan.py)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from edu import plan as plan_store
from edu.db import get_db
from edu.models import (
    ClassOverride,
    Course,
    PlanCourse,
    PlanMeta,
    PlanRequirement,
    PlanSemester,
    SemesterClass,
    Task,
    WorkItem,
)
from edu.schemas import (
    ClassUpdateRequest,
    PlanCourseIn,
    PlanImportRequest,
    PlanRequirementIn,
    PlanSemesterIn,
)

router = APIRouter()

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
        "plan": plan_store.build(session),
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


# ── degree plan edits ─────────────────────────────────────────


def _apply(obj, body, clear: list[str] = ()) -> None:
    for key in clear:
        setattr(obj, key, None)
    for key, value in body.model_dump(exclude_unset=True, exclude={"clear"}).items():
        if value is not None:
            setattr(obj, key, value)


@router.get("/plan")
def get_plan(session: Session = Depends(get_db)) -> dict:
    return plan_store.build(session)


@router.put("/plan/courses/{code}")
def put_plan_course(code: str, body: PlanCourseIn, session: Session = Depends(get_db)) -> dict:
    """Create or edit one plan course (a curriculum mandatory when `period`
    is set, an extra otherwise)."""
    code = code.strip().upper()
    bad = [
        k
        for k in body.clear
        if k not in ("period", "planned", "note", "counts_for", "role", "unlocks", "credits")
    ]
    if bad:
        raise HTTPException(status_code=422, detail=f"Not clearable: {', '.join(bad)}")
    course = session.get(PlanCourse, code)
    if course is None:
        if not body.name:
            raise HTTPException(status_code=422, detail="name is required for a new course")
        course = PlanCourse(code=code, name=body.name)
        session.add(course)
    _apply(course, body, body.clear)
    if body.requires is not None:
        course.requires = [r.strip().upper() for r in body.requires if r.strip()]
    course.updated_at = datetime.now(UTC)
    session.commit()
    return plan_store.course_out(course)


@router.delete("/plan/courses/{code}")
def delete_plan_course(code: str, session: Session = Depends(get_db)) -> dict:
    course = session.get(PlanCourse, code.strip().upper())
    if course is None:
        raise HTTPException(status_code=404, detail="Plan course not found")
    session.delete(course)
    session.commit()
    return {"status": "deleted"}


@router.patch("/plan/requirements/{key}")
def patch_requirement(
    key: str, body: PlanRequirementIn, session: Session = Depends(get_db)
) -> dict:
    req = session.get(PlanRequirement, key)
    if req is None:
        if not body.label:
            raise HTTPException(status_code=422, detail="label is required for a new requirement")
        req = PlanRequirement(key=key, label=body.label)
        session.add(req)
    _apply(req, body)
    session.commit()
    courses = session.scalars(select(PlanCourse)).all()
    return plan_store.requirement_out(req, courses)


@router.delete("/plan/requirements/{key}")
def delete_requirement(key: str, session: Session = Depends(get_db)) -> dict:
    req = session.get(PlanRequirement, key)
    if req is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    session.delete(req)
    session.commit()
    return {"status": "deleted"}


@router.patch("/plan/semesters/{semester}")
def patch_semester(semester: str, body: PlanSemesterIn, session: Session = Depends(get_db)) -> dict:
    sem = session.get(PlanSemester, semester) or PlanSemester(semester=semester)
    session.add(sem)
    _apply(sem, body)
    session.commit()
    return {"semester": sem.semester, "label": sem.label, "note": sem.note, "items": sem.items}


@router.patch("/plan/meta")
def patch_meta(body: dict[str, str | None], session: Session = Depends(get_db)) -> dict:
    """Set plan facts (program, current_semester, graduation_target…); null
    removes a key."""
    for key, value in body.items():
        key = key.strip()
        if not key:
            continue
        row = session.get(PlanMeta, key)
        if value is None:
            if row is not None:
                session.delete(row)
        elif row is None:
            session.add(PlanMeta(key=key, value=str(value)))
        else:
            row.value = str(value)
    session.commit()
    return {m.key: m.value for m in session.scalars(select(PlanMeta)).all()}


@router.post("/plan/import")
def import_plan(body: PlanImportRequest, session: Session = Depends(get_db)) -> dict:
    try:
        return plan_store.import_yaml(session, body.yaml, replace=body.replace)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Bad plan YAML: {exc}") from exc


@router.get("/plan/export")
def export_plan(session: Session = Depends(get_db)) -> Response:
    return Response(plan_store.export_yaml(session), media_type="text/yaml")
