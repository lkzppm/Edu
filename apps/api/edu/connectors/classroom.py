"""Google Classroom connector — official REST API, OAuth 2.0, read-only scopes.

config: {refresh_token}. Access tokens are minted per sync and never stored.
Parsing lives in pure functions (`parse_due`, `coursework_rows`) for fixture tests.
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from edu.config import get_settings
from edu.connectors.base import ConnectorError, replace_grades, upsert_course, upsert_tasks
from edu.models import Account

logger = logging.getLogger("edu.connectors.classroom")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://classroom.googleapis.com/v1"
SCOPES = (
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
)
DONE_STATES = {"TURNED_IN", "RETURNED"}


# ── OAuth ─────────────────────────────────────────────────────


def auth_url() -> str:
    settings = get_settings()
    if not settings.classroom_enabled:
        raise ConnectorError("Google credentials missing — set GOOGLE_CLIENT_ID/SECRET in .env.")
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",  # ensures a refresh_token
            "prompt": "consent",
            "state": "edu",
        }
    )
    return f"{AUTH_URL}?{query}"


def _token_request(data: dict) -> dict:
    settings = get_settings()
    try:
        resp = httpx.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                **data,
            },
            timeout=30,
        )
        payload = resp.json()
    except httpx.HTTPError as exc:
        raise ConnectorError(f"Google unreachable ({exc.__class__.__name__})") from exc
    if resp.status_code != 200 or "error" in payload:
        raise ConnectorError(f"Google OAuth failed: {payload.get('error', resp.status_code)}")
    return payload


def exchange_code(code: str) -> str:
    """Authorization code → refresh token (the only credential we keep)."""
    payload = _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": get_settings().google_redirect_uri,
        }
    )
    refresh = payload.get("refresh_token")
    if not refresh:
        raise ConnectorError(
            "Google returned no refresh token — remove Edu's access in your "
            "Google account permissions and connect again."
        )
    return refresh


def _access_token(refresh_token: str) -> str:
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})[
        "access_token"
    ]


# ── API ───────────────────────────────────────────────────────


def _get(access_token: str, path: str, params: dict | None = None) -> dict:
    try:
        resp = httpx.get(
            f"{API}{path}",
            params=params or {},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
    except httpx.HTTPError as exc:
        raise ConnectorError(f"Classroom unreachable ({exc.__class__.__name__})") from exc
    if resp.status_code == 404:
        return {}
    if resp.status_code != 200:
        raise ConnectorError(f"Classroom API error {resp.status_code}")
    return resp.json()


def _paginate(access_token: str, path: str, list_key: str, params: dict | None = None) -> list:
    items: list = []
    page_token = None
    while True:
        query = dict(params or {})
        if page_token:
            query["pageToken"] = page_token
        data = _get(access_token, path, query)
        items.extend(data.get(list_key, []))
        page_token = data.get("nextPageToken")
        if not page_token:
            return items


# ── pure parsers (fixture-tested) ─────────────────────────────


def parse_due(coursework: dict) -> datetime | None:
    """dueDate {year,month,day} + dueTime {hours,minutes} — both UTC parts."""
    due_date = coursework.get("dueDate")
    if not due_date:
        return None
    time = coursework.get("dueTime") or {}
    return datetime(
        due_date["year"],
        due_date["month"],
        due_date["day"],
        time.get("hours", 23),
        time.get("minutes", 59),
        tzinfo=UTC,
    )


def coursework_rows(coursework: list[dict], submissions: list[dict]) -> list[dict]:
    """courseWork + the student's submissions → unified task rows."""
    by_work: dict[str, dict] = {s.get("courseWorkId"): s for s in submissions}
    rows = []
    for cw in coursework:
        submission = by_work.get(cw["id"], {})
        state = submission.get("state")
        grade = submission.get("assignedGrade")
        # Closest thing to a "graded at" the student API exposes.
        graded_at = None
        if grade is not None and submission.get("updateTime"):
            try:
                graded_at = datetime.fromisoformat(submission["updateTime"])
            except ValueError:
                pass
        rows.append(
            {
                "external_id": f"cw:{cw['id']}",
                "kind": "assignment" if cw.get("workType") == "ASSIGNMENT" else "activity",
                "title": cw.get("title") or "Coursework",
                "description": (cw.get("description") or "").strip(),
                "due_at": parse_due(cw),
                "url": cw.get("alternateLink"),
                "source_done": state in DONE_STATES,
                "source_status": "graded"
                if grade is not None
                else ("submitted" if state in DONE_STATES else None),
                "grade": Decimal(str(grade)) if grade is not None else None,
                "max_grade": Decimal(str(cw["maxPoints"])) if cw.get("maxPoints") else None,
                "graded_at": graded_at,
            }
        )
    return rows


def grade_rows_from_coursework(rows: list[dict]) -> list[dict]:
    """Classroom has no separate gradebook endpoint for students — grade items
    are the point-bearing coursework (graded or still open)."""
    return [
        {
            "external_id": row["external_id"],
            "kind": "item",
            "name": row["title"],
            "grade": row.get("grade"),
            "max_grade": row.get("max_grade"),
            "graded_at": row.get("graded_at"),
            "url": row.get("url"),
        }
        for row in rows
        if row.get("grade") is not None or row.get("max_grade") is not None
    ]


# ── sync ──────────────────────────────────────────────────────


def sync(session: Session, account: Account) -> None:
    if account.config.get("demo"):
        from edu.connectors import demo

        demo.seed_classroom(session, account)
        return

    access = _access_token(account.config["refresh_token"])
    courses = _paginate(access, "/courses", "courses", {"courseStates": "ACTIVE"})
    for c in courses:
        course = upsert_course(
            session,
            account,
            external_id=str(c["id"]),
            name=c.get("name") or str(c["id"]),
            code=c.get("section"),
            url=c.get("alternateLink"),
        )
        try:
            coursework = _paginate(access, f"/courses/{c['id']}/courseWork", "courseWork")
            submissions = _paginate(
                access,
                f"/courses/{c['id']}/courseWork/-/studentSubmissions",
                "studentSubmissions",
                {"userId": "me"},
            )
        except ConnectorError as exc:
            logger.warning("classroom course %s skipped: %s", c["id"], exc)
            continue
        rows = coursework_rows(coursework, submissions)
        upsert_tasks(session, course, rows)
        replace_grades(session, course, grade_rows_from_coursework(rows))
