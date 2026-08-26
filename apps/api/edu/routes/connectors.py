from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from edu.config import get_settings
from edu.connectors import classroom as classroom_connector
from edu.connectors import compasso as compasso_connector
from edu.connectors import moodle as moodle_connector
from edu.connectors.base import ConnectorError, run_sync, run_sync_account
from edu.db import get_db
from edu.models import Account, Course, Task
from edu.schemas import (
    CompassoConnectRequest,
    ConnectorsResponse,
    ConnectorStatus,
    MoodleConnectRequest,
)

router = APIRouter()

CONNECTOR_NAMES = ("moodle", "classroom", "compasso")

# Page-open refresh only touches accounts older than this — opening the
# dashboard repeatedly must never hammer the platforms.
REFRESH_STALE_MINUTES = 15


def _status(session: Session, account: Account) -> ConnectorStatus:
    course_count = (
        session.scalar(select(func.count(Course.id)).where(Course.account_id == account.id)) or 0
    )
    pending = (
        session.scalar(
            select(func.count(Task.id))
            .join(Course, Task.course_id == Course.id)
            .where(Course.account_id == account.id, Task.status == "todo")
        )
        or 0
    )
    return ConnectorStatus(
        id=account.id,
        name=account.connector,
        connected=True,
        institution=account.institution,
        display_name=account.display_name,
        base_url=account.base_url,
        sync_status=account.sync_status,
        last_sync_at=account.last_sync_at.isoformat() if account.last_sync_at else None,
        last_error=account.last_error,
        courses=course_count,
        tasks_pending=pending,
        demo=bool(account.config.get("demo")),
    )


@router.get("", response_model=ConnectorsResponse)
def list_connectors(session: Session = Depends(get_db)) -> ConnectorsResponse:
    accounts = session.scalars(select(Account).order_by(Account.id)).all()
    return ConnectorsResponse(
        classroom_credentials_present=get_settings().classroom_enabled,
        connectors=[_status(session, acc) for acc in accounts],
    )


def _unique_name(session: Session, base: str) -> str:
    """Moodle UFRJ, Moodle UFRJ (2)… — instances need distinct labels."""
    names = set(session.scalars(select(Account.display_name)))
    if base not in names:
        return base
    n = 2
    while f"{base} ({n})" in names:
        n += 1
    return f"{base} ({n})"


def _create_account(session: Session, name: str, **fields) -> Account:
    fields["display_name"] = _unique_name(session, fields["display_name"])
    account = Account(connector=name, sync_status="syncing", **fields)
    session.add(account)
    session.commit()
    return account


def _demo_account(session: Session, name: str, **fields) -> Account:
    """One demo instance per type is plenty — reuse it if present."""
    existing = next(
        (
            acc
            for acc in session.scalars(select(Account).where(Account.connector == name))
            if acc.config.get("demo")
        ),
        None,
    )
    if existing is not None:
        existing.sync_status = "syncing"
        existing.last_error = None
        session.commit()
        return existing
    return _create_account(session, name, **fields)


@router.post("/moodle", status_code=202)
def connect_moodle(
    body: MoodleConnectRequest, tasks: BackgroundTasks, session: Session = Depends(get_db)
):
    base_url = body.base_url.strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Base URL must start with https://")
    token = (body.token or "").strip()
    try:
        if not token:
            if not (body.username and body.password):
                raise ConnectorError("Provide a web-service token or username + password.")
            token = moodle_connector.fetch_token(base_url, body.username.strip(), body.password)
        # Fail fast on a bad token/site before storing anything.
        info = moodle_connector.call(base_url, token, "core_webservice_get_site_info")
    except ConnectorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    sitename = moodle_connector._plain(info.get("sitename")) or "Moodle"
    account = _create_account(
        session,
        "moodle",
        institution=sitename[:80],
        display_name=(body.display_name or sitename)[:120],
        base_url=base_url,
        config={"base_url": base_url, "token": token},
    )
    tasks.add_task(run_sync_account, account.id)
    return {"status": "syncing", "id": account.id}


@router.post("/compasso", status_code=202)
def connect_compasso(
    body: CompassoConnectRequest, tasks: BackgroundTasks, session: Session = Depends(get_db)
):
    page_url = body.page_url.strip().rstrip("/")
    if not page_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Page URL must start with https://")
    try:
        # Fail fast on an unreachable page / private or unparseable sheet.
        info = compasso_connector.probe(page_url)
    except ConnectorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    default_name = f"Compasso {info['code']}" if info["code"] else (info["name"] or "Compasso")
    account = _create_account(
        session,
        "compasso",
        institution="Compasso UFRJ",
        display_name=(body.display_name or default_name)[:120],
        base_url=page_url,
        config={"page_url": page_url},
    )
    tasks.add_task(run_sync_account, account.id)
    return {"status": "syncing", "id": account.id}


@router.get("/classroom/auth-url")
def classroom_auth_url():
    try:
        return {"url": classroom_connector.auth_url()}
    except ConnectorError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/classroom/callback")
def classroom_callback(
    tasks: BackgroundTasks,
    code: str | None = None,
    error: str | None = None,
    session: Session = Depends(get_db),
):
    """OAuth redirect target (reached through the web proxy). Returns a tiny
    page that bounces back to the dashboard."""
    if error or not code:
        return HTMLResponse(
            f"<p style='font-family:sans-serif'>Google sign-in failed ({error or 'no code'}). "
            "<a href='/'>Back to Edu</a></p>",
            status_code=400,
        )
    try:
        refresh_token = classroom_connector.exchange_code(code)
    except ConnectorError as exc:
        return HTMLResponse(
            f"<p style='font-family:sans-serif'>{exc} <a href='/'>Back to Edu</a></p>",
            status_code=502,
        )
    account = _create_account(
        session,
        "classroom",
        institution="Google Classroom",
        display_name="Google Classroom",
        base_url=None,
        config={"refresh_token": refresh_token},
    )
    tasks.add_task(run_sync_account, account.id)
    home = get_settings().web_origin.rstrip("/") + "/" if get_settings().web_origin else "/"
    return HTMLResponse(
        f"<script>window.location.replace({home!r})</script>Connected — redirecting…"
    )


_DEMO_FIELDS = {
    "moodle": {
        "institution": "Moodle (demo)",
        "display_name": "Moodle UFRJ (demo)",
        "base_url": None,
    },
    "classroom": {
        "institution": "Google Classroom (demo)",
        "display_name": "Google Classroom (demo)",
        "base_url": None,
    },
}


@router.post("/{name}/demo", status_code=202)
def load_demo(name: str, tasks: BackgroundTasks, session: Session = Depends(get_db)):
    if name not in _DEMO_FIELDS:
        raise HTTPException(status_code=404, detail="Unknown connector")
    account = _demo_account(session, name, config={"demo": True}, **_DEMO_FIELDS[name])
    tasks.add_task(run_sync_account, account.id)
    return {"status": "syncing", "id": account.id}


@router.post("/refresh", status_code=202)
def refresh_stale(tasks: BackgroundTasks, session: Session = Depends(get_db)):
    """Opportunistic sync, fired by the web app on page open: any account whose
    data is older than the staleness gate syncs in the background. No-op when
    everything is fresh or already syncing."""
    now = datetime.now(UTC)
    stale = [
        acc
        for acc in session.scalars(select(Account))
        if acc.sync_status != "syncing"
        and (
            acc.last_sync_at is None
            or now - acc.last_sync_at > timedelta(minutes=REFRESH_STALE_MINUTES)
        )
    ]
    for account in stale:
        account.sync_status = "syncing"
    session.commit()
    for account in stale:
        tasks.add_task(run_sync_account, account.id)
    return {"status": "syncing" if stale else "fresh", "accounts": len(stale)}


@router.post("/accounts/{account_id}/sync", status_code=202)
def sync_account(account_id: int, tasks: BackgroundTasks, session: Session = Depends(get_db)):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    account.sync_status = "syncing"
    session.commit()
    tasks.add_task(run_sync_account, account_id)
    return {"status": "syncing"}


@router.delete("/accounts/{account_id}")
def disconnect_account(account_id: int, session: Session = Depends(get_db)):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(account)
    session.commit()
    return {"status": "disconnected"}


@router.post("/{name}/sync", status_code=202)
def sync_connector(name: str, tasks: BackgroundTasks, session: Session = Depends(get_db)):
    """Type-level sync: syncs every account of the type."""
    if name not in CONNECTOR_NAMES:
        raise HTTPException(status_code=404, detail="Unknown connector")
    accounts = session.scalars(select(Account).where(Account.connector == name)).all()
    if not accounts:
        raise HTTPException(status_code=404, detail="Connector not configured")
    for account in accounts:
        account.sync_status = "syncing"
    session.commit()
    tasks.add_task(run_sync, name)
    return {"status": "syncing", "accounts": len(accounts)}
