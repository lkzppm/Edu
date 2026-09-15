"""The degree plan — lives in the DB (plan_* tables) so Edu can edit it.

`build()` turns the rows into the shape the College tab renders: the
curriculum grid by period, the road to graduation derived from each
course's `planned` semester (never a second hand-typed list), requirement
meters (computed from courses or stored by hand) and the credit summary.
`import_yaml()` seeds/replaces the tables from a YAML file — the legacy
plano-ECI transcription (pt-BR statuses, separate `forward:` list) or the
`export_yaml()` format — and runs once on first boot when the tables are
empty (data/degree_plan.yml)."""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from edu.models import PlanCourse, PlanMeta, PlanRequirement, PlanSemester

log = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent / "data" / "degree_plan.yml"

STATUSES = ("done", "current", "ahead")
# Legacy plano-ECI vocabulary → semantic statuses (colors hang off these).
LEGACY_STATUS = {"dispensada": "done", "em_curso": "current", "a_cursar": "ahead"}
COURSE_CODE_RE = re.compile(r"^[A-Z]{3}[A-Z0-9]\d{2}$")
META_KEYS = (
    "student",
    "dre",
    "program",
    "curriculum",
    "current_semester",
    "graduation_target",
    "hard_limit",
    "updated",
    "notes",
)


def _semester_key(sem: str) -> tuple[int, int]:
    """'2027/1' → (2027, 1) for sorting; odd values sort last."""
    m = re.match(r"^(\d{4})/(\d)$", sem or "")
    return (int(m.group(1)), int(m.group(2))) if m else (9999, 9)


# ── read ──────────────────────────────────────────────────────


def course_out(c: PlanCourse) -> dict:
    return {
        "code": c.code,
        "name": c.name,
        "credits": c.credits,
        "period": c.period,
        "status": c.status,
        "planned": c.planned,
        "note": c.note,
        "at_risk": c.at_risk,
        "requires": list(c.requires or []),
        "counts_for": c.counts_for,
        "role": c.role,
        "unlocks": c.unlocks,
    }


def requirement_out(r: PlanRequirement, courses: list[PlanCourse]) -> dict:
    done, in_course, required = r.done, r.in_course, r.required
    if r.computed:
        mine = [c for c in courses if c.counts_for == r.key]
        done = sum(c.credits or 0 for c in mine if c.status == "done")
        in_course = sum(c.credits or 0 for c in mine if c.status == "current")
        if required is None:  # no target set → the whole set is the target
            required = sum(c.credits or 0 for c in mine)
    return {
        "key": r.key,
        "label": r.label,
        "unit": r.unit,
        "required": required,
        "done": done,
        "in_course": in_course,
        "computed": r.computed,
        "position": r.position,
    }


def build(session: Session) -> dict:
    courses = session.scalars(select(PlanCourse).order_by(PlanCourse.code)).all()
    reqs = session.scalars(
        select(PlanRequirement).order_by(PlanRequirement.position, PlanRequirement.key)
    ).all()
    semesters = {s.semester: s for s in session.scalars(select(PlanSemester)).all()}
    meta = {m.key: m.value for m in session.scalars(select(PlanMeta)).all()}
    current = meta.get("current_semester")

    # Curriculum grid: mandatories by period.
    by_period: dict[int, list[dict]] = defaultdict(list)
    for c in courses:
        if c.period is not None:
            by_period[c.period].append(course_out(c))
    periods = [{"period": p, "courses": by_period[p]} for p in sorted(by_period)]

    # Road to graduation: current semester = everything in course; then each
    # planned semester in order. Free-form items (defense, ACE) ride along.
    by_sem: dict[str, list[dict]] = defaultdict(list)
    for c in courses:
        if c.status == "current" and current:
            by_sem[current].append(course_out(c))
        elif c.status == "ahead" and c.planned:
            by_sem[c.planned].append(course_out(c))
    for sem in semesters:
        by_sem.setdefault(sem, [])
    road = []
    for i, sem in enumerate(sorted(by_sem, key=_semester_key)):
        ps = semesters.get(sem)
        items = by_sem[sem]
        credits = sum(c["credits"] or 0 for c in items)
        road.append(
            {
                "semester": sem,
                "label": ps.label if ps and ps.label else f"semester {i + 1:02d}",
                "note": ps.note if ps else None,
                "current": sem == current,
                "courses": items,
                "items": list(ps.items or []) if ps else [],
                "credits": credits,
            }
        )

    # Credit summary over the curriculum (the mandatories).
    credits = {s: 0 for s in STATUSES}
    counts = {s: 0 for s in STATUSES}
    for c in courses:
        if c.period is not None and c.status in credits:
            credits[c.status] += c.credits or 0
            counts[c.status] += 1
    total = sum(credits.values())

    return {
        "meta": meta,
        "requirements": [requirement_out(r, courses) for r in reqs],
        "periods": periods,
        "road": road,
        "extras": [course_out(c) for c in courses if c.period is None],
        "summary": {
            "credits": credits,
            "counts": counts,
            "total_credits": total,
            "done_pct": round(credits["done"] / total * 100, 1) if total else None,
        },
    }


# ── import / export ───────────────────────────────────────────


def _status(value) -> str:
    v = str(value or "ahead").strip().lower()
    return LEGACY_STATUS.get(v, v if v in STATUSES else "ahead")


def _rows_from_legacy(data: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """plano-ECI transcription: `curriculum` by period + a hand-typed
    `forward` list. Forward entries fold into the courses (role, unlocks,
    planned); non-course entries (ACE, defense, 'OPT') become semester items."""
    courses: dict[str, dict] = {}
    for period in data.get("curriculum") or []:
        for c in period.get("courses") or []:
            code = str(c["code"]).strip().upper()
            courses[code] = {
                "code": code,
                "name": c.get("name") or code,
                "credits": c.get("credits"),
                "period": period.get("period"),
                "status": _status(c.get("status")),
                "planned": c.get("planned"),
                "note": c.get("note"),
                "at_risk": bool(c.get("at_risk")),
                "requires": [str(r).upper() for r in c.get("requires") or []],
                "counts_for": "obrigatorias",
                "role": None,
                "unlocks": None,
            }
    semesters: list[dict] = []
    current = (data.get("meta") or {}).get("current_semester")
    for block in data.get("forward") or []:
        sem = str(block.get("semester"))
        items: list[dict] = []
        for entry in block.get("courses") or []:
            code = str(entry.get("code") or "").strip().upper()
            role = entry.get("role")
            course = courses.get(code)
            if course is not None and code not in {i.get("code") for i in items}:
                if course["status"] == "ahead" and not course["planned"]:
                    course["planned"] = sem
                if course["planned"] == sem or course["status"] == "current":
                    course["role"] = role or course["role"]
                    course["unlocks"] = entry.get("unlocks") or course["unlocks"]
                    course["note"] = course["note"] or entry.get("note")
                    continue
            if COURSE_CODE_RE.match(code) and role in ("optativa", "livre", "humanas"):
                # A real course outside the curriculum — an extra.
                courses[code] = {
                    "code": code,
                    "name": entry.get("name") or code,
                    "credits": entry.get("credits"),
                    "period": None,
                    "status": "current" if sem == current else "ahead",
                    "planned": None if sem == current else sem,
                    "note": entry.get("note"),
                    "at_risk": False,
                    "requires": [],
                    "counts_for": {"optativa": "optativas"}.get(role, role),
                    "role": role,
                    "unlocks": None,
                }
                continue
            items.append(
                {
                    k: v
                    for k, v in {
                        "code": code or None,
                        "name": entry.get("name"),
                        "role": role,
                        "note": entry.get("note"),
                    }.items()
                    if v
                }
            )
        semesters.append(
            {
                "semester": sem,
                "label": block.get("label"),
                "note": block.get("note"),
                "items": items,
            }
        )
    reqs = []
    for i, r in enumerate(data.get("requirements") or []):
        reqs.append(
            {
                "key": r["key"],
                "label": r.get("label") or r["key"],
                "unit": r.get("unit") or "cr",
                "required": r.get("required"),
                "done": r.get("done") or 0,
                "in_course": r.get("in_course") or 0,
                "computed": r.get("computed", r["key"] == "obrigatorias"),
                "position": i,
            }
        )
    return list(courses.values()), reqs, semesters


def _rows_from_export(data: dict) -> tuple[list[dict], list[dict], list[dict]]:
    courses = []
    for c in data.get("courses") or []:
        courses.append(
            {
                "code": str(c["code"]).strip().upper(),
                "name": c.get("name") or c["code"],
                "credits": c.get("credits"),
                "period": c.get("period"),
                "status": _status(c.get("status")),
                "planned": c.get("planned"),
                "note": c.get("note"),
                "at_risk": bool(c.get("at_risk")),
                "requires": [str(r).upper() for r in c.get("requires") or []],
                "counts_for": c.get("counts_for"),
                "role": c.get("role"),
                "unlocks": c.get("unlocks"),
            }
        )
    reqs = [
        {
            "key": r["key"],
            "label": r.get("label") or r["key"],
            "unit": r.get("unit") or "cr",
            "required": r.get("required"),
            "done": r.get("done") or 0,
            "in_course": r.get("in_course") or 0,
            "computed": bool(r.get("computed")),
            "position": r.get("position", i),
        }
        for i, r in enumerate(data.get("requirements") or [])
    ]
    semesters = [
        {
            "semester": str(s["semester"]),
            "label": s.get("label"),
            "note": s.get("note"),
            "items": list(s.get("items") or []),
        }
        for s in data.get("semesters") or []
    ]
    return courses, reqs, semesters


def import_yaml(session: Session, text: str, replace: bool = True) -> dict:
    """Load a plan YAML (legacy or exported shape). `replace` wipes the
    current plan first; otherwise rows are upserted by key."""
    data = yaml.safe_load(text) or {}
    if not isinstance(data, dict):
        raise TypeError("plan YAML must be a mapping")
    if "courses" in data:
        courses, reqs, semesters = _rows_from_export(data)
    else:
        courses, reqs, semesters = _rows_from_legacy(data)
    meta = {k: str(v) for k, v in (data.get("meta") or {}).items() if v is not None}

    if replace:
        for model in (PlanCourse, PlanRequirement, PlanSemester, PlanMeta):
            session.execute(delete(model))
        session.flush()
    now = datetime.now(UTC)
    for row in courses:
        session.merge(PlanCourse(**row, updated_at=now))
    for row in reqs:
        session.merge(PlanRequirement(**row))
    for row in semesters:
        session.merge(PlanSemester(**row))
    for key, value in meta.items():
        session.merge(PlanMeta(key=key, value=value))
    session.commit()
    return {"courses": len(courses), "requirements": len(reqs), "semesters": len(semesters)}


def export_yaml(session: Session) -> str:
    plan = build(session)
    courses = sorted(
        session.scalars(select(PlanCourse)).all(), key=lambda c: (c.period or 99, c.code)
    )
    doc = {
        "meta": plan["meta"],
        "requirements": [
            {k: r[k] for k in ("key", "label", "unit", "required", "done", "in_course", "computed")}
            for r in plan["requirements"]
        ],
        "semesters": [
            {"semester": s["semester"], "label": s["label"], "note": s["note"], "items": s["items"]}
            for s in plan["road"]
            if s["label"] or s["note"] or s["items"]
        ],
        "courses": [
            {k: v for k, v in course_out(c).items() if v not in (None, [], False)} for c in courses
        ],
    }
    return yaml.safe_dump(doc, allow_unicode=True, sort_keys=False, width=100)


def seed_if_empty(session: Session, path: Path = SEED_PATH) -> bool:
    """First boot: load the bundled YAML when the plan tables are empty."""
    if session.scalar(select(PlanCourse.code).limit(1)) is not None:
        return False
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    stats = import_yaml(session, text)
    log.info("degree plan seeded from %s: %s", path.name, stats)
    return True
