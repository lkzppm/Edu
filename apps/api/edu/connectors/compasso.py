"""Compasso connector — UFRJ course pages (compasso.ufrj.br/disciplinas/…)
that publish the semester schedule as an embedded **public** Google Sheet.

There is no API and no login: the page is public HTML and the sheet answers
the anonymous CSV export endpoint. Each sync re-reads the page to rediscover
the sheet id, so a sheet swapped in for a new semester is picked up without
reconnecting. One page = one course.

Sheet rows carry `dd/mm` dates with no year; the year comes from the page's
"YYYY-1|2" semester label when present (Brazilian semesters never cross New
Year), else from proximity to today.
"""

import csv
import html
import io
import re
import unicodedata
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from edu.config import get_settings
from edu.connectors.base import ConnectorError, upsert_course, upsert_tasks
from edu.connectors.moodle import COURSE_CODE_RE, EXAM_RE
from edu.models import Account

TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
SHEET_ID_RE = re.compile(r"docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]{20,})")
SEMESTER_RE = re.compile(r"\b(20\d{2})-[12]\b")
DATE_RE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})\s*$")
DELIVERY_RE = re.compile(r"\bentrega\b", re.IGNORECASE)
# "Aula remota devido a…" lands in the tarefas column but is a note, not work.
NOTE_RE = re.compile(r"\baulas?\b", re.IGNORECASE)
# "Entrega de nota P2…" mentions the exam but is a grade handout, not a test.
GRADE_NOTE_RE = re.compile(r"\bnotas?\b", re.IGNORECASE)


def _unreachable(what: str, exc: httpx.HTTPError) -> ConnectorError:
    detail = str(exc) or type(exc).__name__
    return ConnectorError(f"{what} unreachable: {detail}")


def _fetch(url: str, what: str) -> httpx.Response:
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        return resp
    except httpx.HTTPError as exc:
        raise _unreachable(what, exc) from exc


def fetch_page(page_url: str) -> str:
    return _fetch(page_url, "Compasso page").text


def fetch_csv(sheet_id: str) -> str:
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    resp = _fetch(url, "Schedule sheet")
    if "text/csv" not in resp.headers.get("content-type", ""):
        # A private sheet 200s into a Google sign-in page instead of CSV.
        raise ConnectorError("The schedule sheet isn't public — CSV export requires sign-in.")
    return resp.text


def parse_page(page_html: str) -> dict:
    """Extract course title/code, the embedded sheet id and the semester year."""
    title = ""
    if match := TITLE_RE.search(page_html):
        title = html.unescape(match.group(1)).strip()
    code_match = COURSE_CODE_RE.search(title)
    code = code_match.group(0) if code_match else None
    name = title
    if code:
        name = re.sub(rf"\s*[-–|]\s*{re.escape(code)}\s*$", "", title).strip() or title
    sheet = SHEET_ID_RE.search(page_html)
    year = SEMESTER_RE.search(page_html)
    return {
        "name": name,
        "code": code,
        "sheet_id": sheet.group(1) if sheet else None,
        "year_hint": int(year.group(1)) if year else None,
    }


def _slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:60]


def resolve_date(day: int, month: int, year_hint: int | None, today: date) -> date | None:
    """dd/mm has no year: trust the page's semester label, else pick the
    candidate year closest to today (handles a Aug–Dec sheet read in January)."""
    years = [year_hint] if year_hint else [today.year - 1, today.year, today.year + 1]
    candidates = []
    for year in years:
        try:
            candidates.append(date(year, month, day))
        except ValueError:
            continue
    return min(candidates, key=lambda d: abs(d - today)) if candidates else None


def _due(day: date, tz: str) -> datetime:
    # No time in the sheet — end of the local day, matching Classroom's default.
    return datetime.combine(day, time(23, 59), tzinfo=ZoneInfo(tz)).astimezone(UTC)


def _find_header(rows: list[list[str]]) -> tuple[int, int, int | None, int | None]:
    for i, row in enumerate(rows):
        cells = [cell.strip().lower() for cell in row]
        if "data" in cells:
            activity = next((j for j, c in enumerate(cells) if "atividade" in c), None)
            extra = next((j for j, c in enumerate(cells) if "tarefa" in c), None)
            return i, cells.index("data"), activity, extra
    raise ConnectorError("Schedule sheet has no 'Data' column — layout not recognized.")


def parse_schedule(
    csv_text: str,
    *,
    year_hint: int | None,
    today: date,
    tz: str,
    url: str | None = None,
) -> list[dict]:
    """Rows for upsert_tasks: exams from the activities column, deliverables
    and practice work from the 'Tarefas Extra Classe' column. Plain lectures
    are schedule, not to-dos — they don't become tasks."""
    rows = list(csv.reader(io.StringIO(csv_text)))
    header, idx_date, idx_activity, idx_extra = _find_header(rows)

    def cell(row: list[str], idx: int | None) -> str:
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    tasks: list[dict] = []
    for row in rows[header + 1 :]:
        match = DATE_RE.match(cell(row, idx_date))
        if not match:
            continue
        day = resolve_date(int(match.group(1)), int(match.group(2)), year_hint, today)
        if day is None:
            continue
        common = {"description": "", "url": url, "due_at": _due(day, tz), "source_done": False}
        activity = cell(row, idx_activity)
        if activity and EXAM_RE.search(activity) and not GRADE_NOTE_RE.search(activity):
            tasks.append(
                {"external_id": f"exam:{day.isoformat()}", "kind": "exam", "title": activity}
                | common
            )
        extra = cell(row, idx_extra)
        if extra and not NOTE_RE.search(extra):
            kind = "assignment" if DELIVERY_RE.search(extra) else "activity"
            tasks.append(
                {"external_id": f"extra:{day.isoformat()}:{_slug(extra)}", "kind": kind, "title": extra}
                | common
            )
    return tasks


def probe(page_url: str) -> dict:
    """Fail-fast validation for the connect route: page reachable, sheet
    linked and public, layout parseable. Returns the parsed page info."""
    page = parse_page(fetch_page(page_url))
    if not page["sheet_id"]:
        raise ConnectorError("No public Google Sheets schedule found on that page.")
    tz = get_settings().timezone
    today = datetime.now(ZoneInfo(tz)).date()
    parse_schedule(
        fetch_csv(page["sheet_id"]), year_hint=page["year_hint"], today=today, tz=tz, url=page_url
    )
    return page


def sync(session: Session, account: Account) -> None:
    page_url = account.config.get("page_url") or account.base_url
    if not page_url:
        raise ConnectorError("Account has no page URL configured.")
    page = parse_page(fetch_page(page_url))
    if not page["sheet_id"]:
        raise ConnectorError("No public Google Sheets schedule found on the page.")
    course = upsert_course(
        session,
        account,
        external_id=f"page:{_slug(page_url.rstrip('/').rsplit('/', 1)[-1])}",
        name=page["name"] or page_url,
        code=page["code"],
        url=page_url,
    )
    tz = get_settings().timezone
    today = datetime.now(ZoneInfo(tz)).date()
    rows = parse_schedule(
        fetch_csv(page["sheet_id"]), year_hint=page["year_hint"], today=today, tz=tz, url=page_url
    )
    upsert_tasks(session, course, rows)
    session.commit()
