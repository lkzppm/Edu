"""Moodle Web Services connector — one connector for any Moodle site
(Moodle UFRJ and Polimoodle are UI presets over base_url).

Auth: a mobile-service token stored in config (obtained directly by the user or
exchanged from username/password via login/token.php — password never stored).
Parsing lives in pure `*_rows` functions so tests run on recorded fixtures.
"""

import html
import logging
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from edu.connectors.base import ConnectorError, replace_grades, upsert_course, upsert_tasks
from edu.models import Account, Task

logger = logging.getLogger("edu.connectors.moodle")

MOBILE_SERVICE = "moodle_mobile_app"
EXAM_RE = re.compile(
    r"\b(prova|provas|exame|exam|test|teste|p[123]|pf|midterm|final)\b", re.IGNORECASE
)
# Completion states 1 (complete) and 2 (complete, passed) both mean done.
COMPLETE_STATES = {1, 2}


def _unreachable(exc: httpx.HTTPError) -> ConnectorError:
    """Surface the transport failure's own message (cert mismatch, DNS, timeout…)
    — connection-level errors never contain credentials."""
    detail = str(exc).strip() or exc.__class__.__name__
    return ConnectorError(f"Moodle unreachable: {detail[:200]}")


def _flatten(params: dict, prefix: str = "") -> dict:
    """Moodle REST wants nested params as key[sub][0]=… pairs."""
    flat: dict = {}
    for key, value in params.items():
        name = f"{prefix}[{key}]" if prefix else str(key)
        if isinstance(value, dict):
            flat.update(_flatten(value, name))
        elif isinstance(value, (list, tuple)):
            for i, item in enumerate(value):
                if isinstance(item, dict):
                    flat.update(_flatten(item, f"{name}[{i}]"))
                else:
                    flat[f"{name}[{i}]"] = item
        else:
            flat[name] = value
    return flat


def call(base_url: str, token: str, wsfunction: str, **params):
    url = f"{base_url.rstrip('/')}/webservice/rest/server.php"
    payload = {
        "wstoken": token,
        "wsfunction": wsfunction,
        "moodlewsrestformat": "json",
        **_flatten(params),
    }
    try:
        resp = httpx.post(url, data=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise _unreachable(exc) from exc
    if isinstance(data, dict) and data.get("exception"):
        message = data.get("message") or data.get("errorcode") or "unknown error"
        raise ConnectorError(f"Moodle: {message}")
    return data


def fetch_token(base_url: str, username: str, password: str) -> str:
    """Exchange username/password for a mobile-service token. The password is
    used for this one request and never stored or logged."""
    url = f"{base_url.rstrip('/')}/login/token.php"
    try:
        resp = httpx.post(
            url,
            data={"username": username, "password": password, "service": MOBILE_SERVICE},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise _unreachable(exc) from exc
    if not isinstance(data, dict) or not data.get("token"):
        detail = data.get("error", "login rejected") if isinstance(data, dict) else "login rejected"
        raise ConnectorError(f"Moodle login failed: {detail}")
    return data["token"]


def _plain(text: str | None) -> str:
    """HTML → collapsed plain text (Moodle intros are HTML)."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def _ts(epoch) -> datetime | None:
    if not epoch:
        return None
    return datetime.fromtimestamp(int(epoch), UTC)


# UFRJ-style course codes: COS242, EEL873, MAC238, FIT-A12…
COURSE_CODE_RE = re.compile(r"\b[A-Z]{2,4}-?\d{3}[A-Z0-9]{0,3}\b")
TERM_RE = re.compile(r"\b\d{4}\s*[/.\-]\s*\d\b")  # 2026/2, 2026.1
SEPARATORS_RE = re.compile(r"\s+[-–—]\s+")


def parse_course_names(fullname: str | None, shortname: str | None) -> tuple[str, str | None]:
    """Untangle code / term / human name — sites pack them differently:
    UFRJ: fullname "COS242 - 2026/2 - Teoria dos Grafos (ECI)", shortname
    "COS242 - 2026/2"; Poli: fullname "2026/2 - Sistemas Operacionais - EEL770",
    shortname the bare name. Returns (clean name, code)."""
    full = _plain(fullname)
    short = _plain(shortname)
    source = full or short
    match = COURSE_CODE_RE.search(source) or COURSE_CODE_RE.search(short)
    code = match.group(0) if match else None
    if code is None and short and short != full and " " not in short and len(short) <= 12:
        code = short  # code-like shortname without the standard pattern

    kept = []
    for token in SEPARATORS_RE.split(source):
        if code:
            token = token.replace(code, "")
        token = TERM_RE.sub("", token).strip(" -–—/")
        if token:
            kept.append(token)
    name = " - ".join(kept) or code or source
    return name, code


def assignment_rows(base_url: str, payload: dict) -> dict[str, list[dict]]:
    """mod_assign_get_assignments → {course external_id: [task rows]}."""
    base = base_url.rstrip("/")
    rows: dict[str, list[dict]] = defaultdict(list)
    for course in payload.get("courses", []):
        for assign in course.get("assignments", []):
            cmid = assign.get("cmid")
            rows[str(course["id"])].append(
                {
                    "external_id": f"assign:{assign['id']}",
                    "kind": "assignment",
                    "title": assign.get("name") or "Assignment",
                    "description": _plain(assign.get("intro")),
                    "due_at": _ts(assign.get("duedate")),
                    "url": f"{base}/mod/assign/view.php?id={cmid}" if cmid else None,
                    "cmid": cmid,
                }
            )
    return rows


def quiz_rows(base_url: str, payload: dict) -> dict[str, list[dict]]:
    """mod_quiz_get_quizzes_by_courses → {course external_id: [task rows]}."""
    base = base_url.rstrip("/")
    rows: dict[str, list[dict]] = defaultdict(list)
    for quiz in payload.get("quizzes", []):
        cmid = quiz.get("coursemodule")
        rows[str(quiz["course"])].append(
            {
                "external_id": f"quiz:{quiz['id']}",
                "kind": "quiz",
                "title": quiz.get("name") or "Quiz",
                "description": _plain(quiz.get("intro")),
                "due_at": _ts(quiz.get("timeclose")),
                "url": f"{base}/mod/quiz/view.php?id={cmid}" if cmid else None,
                "cmid": cmid,
            }
        )
    return rows


def event_rows(payload: dict) -> dict[str, list[dict]]:
    """core_calendar_get_calendar_events → {course external_id: [task rows]}.

    Module events already covered by assignments/quizzes are skipped; names
    matching EXAM_RE become `exam` (test dates are usually plain course events).
    """
    rows: dict[str, list[dict]] = defaultdict(list)
    for event in payload.get("events", []):
        if event.get("modulename") in ("assign", "quiz"):
            continue
        course_id = event.get("courseid")
        if not course_id:
            continue
        name = event.get("name") or "Event"
        rows[str(course_id)].append(
            {
                "external_id": f"event:{event['id']}",
                "kind": "exam" if EXAM_RE.search(name) else "event",
                "title": name,
                "description": _plain(event.get("description")),
                "due_at": _ts(event.get("timestart")),
                "url": None,
                "cmid": None,
            }
        )
    return rows


def apply_completion(rows: list[dict], completed_cmids: set[int]) -> None:
    for row in rows:
        if row.get("cmid") in completed_cmids:
            row["source_done"] = True
            row["source_status"] = "completed"


def grade_rows(base_url: str, payload: dict) -> list[dict]:
    """gradereport_user_get_grade_items → grade item rows.

    Real shapes (2026-08-24): itemtype `mod`/`manual` are gradable items,
    `course` is the course total (itemname null), `category` is unnamed
    structure — skipped. graderaw is null until the professor grades;
    `gradedategraded` is the grading timestamp and `cmid`+`itemmodule` deep-link
    the activity (verified on both sites)."""
    base = base_url.rstrip("/")

    def dec(value) -> Decimal | None:
        return Decimal(str(value)) if value is not None else None

    rows = []
    for usergrade in payload.get("usergrades", []):
        for item in usergrade.get("gradeitems", []):
            itemtype = item.get("itemtype")
            if itemtype == "category":
                continue
            kind = "total" if itemtype == "course" else "item"
            name = _plain(item.get("itemname")) or ("Total" if kind == "total" else "")
            if not name:
                continue
            cmid = item.get("cmid")
            module = item.get("itemmodule")
            rows.append(
                {
                    "external_id": f"gi:{item['id']}",
                    "kind": kind,
                    "name": name,
                    "grade": dec(item.get("graderaw")),
                    "max_grade": dec(item.get("grademax")),
                    "graded_at": _ts(item.get("gradedategraded")),
                    "url": f"{base}/mod/{module}/view.php?id={cmid}" if cmid and module else None,
                }
            )
    return rows


def parse_submission(payload: dict) -> tuple[bool, str | None]:
    """mod_assign_get_submission_status → (done, source_status).

    The completion API only tracks manual checkboxes/views (Polimoodle showed
    submitted work as incomplete, 2026-08-21) — an assignment's own submission
    status is the truth for "did I deliver this"."""
    last = payload.get("lastattempt") or {}
    statuses = {
        (last.get("submission") or {}).get("status"),
        (last.get("teamsubmission") or {}).get("status"),
    }
    if "submitted" not in statuses:
        return False, None
    graded = bool((payload.get("feedback") or {}).get("grade"))
    return True, "graded" if graded else "submitted"


# ── sync ──────────────────────────────────────────────────────


def sync(session: Session, account: Account) -> None:
    if account.config.get("demo"):
        from edu.connectors import demo

        demo.seed_moodle(session, account)
        return

    base = account.config["base_url"]
    token = account.config["token"]

    info = call(base, token, "core_webservice_get_site_info")
    userid = info["userid"]
    if info.get("sitename"):
        account.institution = _plain(info["sitename"])[:80]

    courses_payload = call(base, token, "core_enrol_get_users_courses", userid=userid)
    course_ids = [c["id"] for c in courses_payload]
    course_by_ext = {}
    for c in courses_payload:
        name, code = parse_course_names(c.get("fullname"), c.get("shortname"))
        course_by_ext[str(c["id"])] = upsert_course(
            session,
            account,
            external_id=str(c["id"]),
            name=name or str(c["id"]),
            code=code,
            url=f"{base.rstrip('/')}/course/view.php?id={c['id']}",
        )
    if not course_ids:
        return

    # Each block fails soft — a restrictive site still yields what it exposes.
    merged: dict[str, list[dict]] = defaultdict(list)

    def gather(label: str, fetch):
        try:
            for ext_id, rows in fetch().items():
                merged[ext_id].extend(rows)
        except ConnectorError as exc:
            logger.warning("moodle %s skipped for #%s: %s", label, account.id, exc)

    gather(
        "assignments",
        lambda: assignment_rows(
            base, call(base, token, "mod_assign_get_assignments", courseids=course_ids)
        ),
    )
    gather(
        "quizzes",
        lambda: quiz_rows(
            base, call(base, token, "mod_quiz_get_quizzes_by_courses", courseids=course_ids)
        ),
    )
    timestart = int((datetime.now(UTC) - timedelta(days=14)).timestamp())
    gather(
        "calendar",
        lambda: event_rows(
            call(
                base,
                token,
                "core_calendar_get_calendar_events",
                events={"courseids": course_ids},
                options={"userevents": 0, "siteevents": 0, "timestart": timestart},
            )
        ),
    )

    for ext_id, rows in merged.items():
        course = course_by_ext.get(ext_id)
        if course is None:
            continue
        try:
            statuses = call(
                base,
                token,
                "core_completion_get_activities_completion_status",
                courseid=int(ext_id),
                userid=userid,
            ).get("statuses", [])
            completed = {s["cmid"] for s in statuses if s.get("state") in COMPLETE_STATES}
            apply_completion(rows, completed)
        except ConnectorError:
            pass  # completion tracking disabled on this site/course

        # Completion misses actual deliveries — ask each still-open assignment
        # for its real submission status. Skip ones already done locally (no
        # information to gain) to keep the call count down.
        settled = set(
            session.scalars(
                select(Task.external_id).where(Task.course_id == course.id, Task.status != "todo")
            )
        )
        for row in rows:
            if (
                row["kind"] != "assignment"
                or row.get("source_done")
                or row["external_id"] in settled
            ):
                continue
            try:
                payload = call(
                    base,
                    token,
                    "mod_assign_get_submission_status",
                    assignid=int(row["external_id"].removeprefix("assign:")),
                )
            except ConnectorError:
                continue
            done, source_status = parse_submission(payload)
            if done:
                row["source_done"] = True
                row["source_status"] = source_status

        for row in rows:
            row.pop("cmid", None)
        upsert_tasks(session, course, rows)

    # Gradebook — every course, tasks or not; fails soft per course.
    for ext_id, course in course_by_ext.items():
        try:
            payload = call(
                base,
                token,
                "gradereport_user_get_grade_items",
                courseid=int(ext_id),
                userid=userid,
            )
            replace_grades(session, course, grade_rows(base, payload))
        except ConnectorError as exc:
            logger.warning("moodle grades skipped for course %s: %s", ext_id, exc)
