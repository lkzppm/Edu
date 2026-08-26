"""Claude Cowork connector — the local UFRJ workspace directory.

Not a platform: a read-only bind mount of the directory where coursework is
produced with Claude (`COWORK_DIR` on the host → `WORKSPACE_DIR` in the
container; on the homelab it's the synced replica, see spec/deploy.md). The
contract is the pattern documented in the workspace's own README:

- `classes/CODIGO_Nome/CONTEXT.md` — YAML frontmatter (code, name, schedule,
  professor, evaluation, platform_url…) is structured; the prose below is
  Claude's and is never parsed.
- `classes/*/listas/AAAA-MM-DD_Slug/` — one delivery folder = one work item.

Sync fully replaces the registry (it mirrors the filesystem) and links
platform courses to their canonical class by course code or platform URL.
Edu NEVER writes into the workspace.
"""

import re
from datetime import UTC, datetime
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from edu.config import get_settings
from edu.connectors.base import ConnectorError
from edu.models import Account, Course, SemesterClass, WorkItem

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
CLASS_DIR_RE = re.compile(r"^[A-Z]{2,4}\d{3}\w*_")
LISTA_DIR_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})_(.+)$")
# The advertised polimoodle hostname aliases the canonical one (see
# spec/connectors.md) — normalize so URLs match across sources.
HOST_ALIASES = {"polimoodle.poli.ufrj.br": "moodle.poli.ufrj.br"}

CLASS_FIELDS = (
    "semester",
    "turma",
    "kind",
    "anchor",
    "professor",
    "contact",
    "evaluation",
    "platform",
    "platform_url",
)


def parse_frontmatter(text: str) -> dict | None:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return None
    try:
        data = yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None
    return data if isinstance(data, dict) else None


def parse_context(path: Path) -> dict | None:
    """One CONTEXT.md → a registry row dict; None when the contract is absent."""
    try:
        data = parse_frontmatter(path.read_text(encoding="utf-8"))
    except OSError:
        return None
    if not data or not data.get("code") or not data.get("name"):
        return None
    row = {
        "code": str(data["code"]).strip().upper(),
        "name": str(data["name"]).strip(),
        "credits": int(data["credits"]) if data.get("credits") is not None else None,
        "period": int(data["period"]) if data.get("period") is not None else None,
        "flags": [str(f) for f in data.get("flags") or []],
        "links": [dict(li) for li in data.get("links") or [] if isinstance(li, dict)],
        "schedule": [dict(s) for s in data.get("schedule") or [] if isinstance(s, dict)],
        "workspace_path": str(path.parent),
    }
    for field in CLASS_FIELDS:
        value = data.get(field)
        row[field] = str(value).strip() if value is not None else None
    if row["platform"] == "none":
        row["platform"] = None
    return row


def scan_work_items(class_dir: Path, code: str) -> list[dict]:
    listas = class_dir / "listas"
    if not listas.is_dir():
        return []
    items = []
    for entry in sorted(listas.iterdir()):
        match = entry.is_dir() and LISTA_DIR_RE.match(entry.name)
        if not match:
            continue
        try:
            date = datetime.strptime(match.group(1), "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            continue
        files = [f for f in entry.rglob("*") if f.is_file() and not f.name.startswith(".")]
        items.append(
            {
                "class_code": code,
                "date": date,
                "slug": match.group(2),
                "title": match.group(2).replace("-", " "),
                "path": str(entry),
                "files": len(files),
                "has_pdf": any(f.suffix.lower() == ".pdf" for f in files),
            }
        )
    return items


def scan_workspace(root: str | Path) -> tuple[list[dict], list[dict]]:
    classes_dir = Path(root) / "classes"
    if not classes_dir.is_dir():
        raise ConnectorError(
            "Workspace not mounted (no classes/ directory) — check the COWORK_DIR "
            "bind mount in docker-compose and the WORKSPACE_DIR setting."
        )
    classes, items = [], []
    for entry in sorted(classes_dir.iterdir()):
        if not entry.is_dir() or not CLASS_DIR_RE.match(entry.name):
            continue
        row = parse_context(entry / "CONTEXT.md")
        if row is None:
            continue
        classes.append(row)
        items.extend(scan_work_items(entry, row["code"]))
    if not classes:
        raise ConnectorError(
            "No classes with CONTEXT.md frontmatter found — the workspace doesn't "
            "follow the pattern (see the README in the classes folder)."
        )
    return classes, items


def norm_url(url: str | None) -> str | None:
    if not url:
        return None
    bare = re.sub(r"^https?://", "", url.strip()).rstrip("/")
    host, _, rest = bare.partition("/")
    host = HOST_ALIASES.get(host.lower(), host.lower())
    return f"{host}/{rest}" if rest else host


def link_courses(session: Session, classes: list[dict]) -> None:
    """Stamp Course.class_code by code or platform-URL match. Re-derived on
    every sync so platform courses that appear later get picked up."""
    courses = session.scalars(select(Course)).all()
    by_code = {row["code"]: row for row in classes}
    by_url = {norm_url(row["platform_url"]): row for row in classes if row["platform_url"]}
    for course in courses:
        target = None
        if course.code and course.code.strip().upper() in by_code:
            target = by_code[course.code.strip().upper()]
        elif norm_url(course.url) in by_url:
            target = by_url[norm_url(course.url)]
        course.class_code = target["code"] if target else None
    session.flush()


def probe() -> dict:
    classes, items = scan_workspace(get_settings().workspace_dir)
    return {"classes": len(classes), "work_items": len(items)}


def sync(session: Session, account: Account) -> None:
    root = account.config.get("dir") or get_settings().workspace_dir
    classes, items = scan_workspace(root)
    now = datetime.now(UTC)

    existing = {sc.code: sc for sc in session.scalars(select(SemesterClass))}
    seen = set()
    for row in classes:
        seen.add(row["code"])
        sc = existing.get(row["code"]) or SemesterClass(code=row["code"])
        if sc.id is None:
            session.add(sc)
        for key, value in row.items():
            setattr(sc, key, value)
        sc.updated_at = now
    for code, sc in existing.items():
        if code not in seen:
            session.delete(sc)

    # Work items mirror the filesystem — full replace.
    session.execute(delete(WorkItem))
    for item in items:
        session.add(WorkItem(**item, updated_at=now))

    link_courses(session, classes)
    session.commit()
