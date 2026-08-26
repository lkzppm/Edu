"""Background jobs. Every job is wrapped so a failing source never crashes
the scheduler (rule 4): run_sync already fails soft."""

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from edu.config import get_settings
from edu.connectors.base import run_sync, run_sync_account
from edu.db import SessionLocal
from edu.models import Account

logger = logging.getLogger("edu.jobs")

# Data older than this is stale enough to re-sync outside the cron slots.
STALE_AFTER_HOURS = 6


def job_catchup() -> None:
    """Self-healing sync: any account whose data is older than the staleness
    window syncs immediately — covers interval slots missed while the host
    slept."""
    try:
        with SessionLocal() as session:
            now = datetime.now(UTC)
            stale = [
                (acc.id, acc.connector)
                for acc in session.scalars(select(Account))
                if acc.sync_status != "syncing"
                and (
                    acc.last_sync_at is None
                    or now - acc.last_sync_at > timedelta(hours=STALE_AFTER_HOURS)
                )
            ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("catch-up scan failed: %s", exc)
        return
    for account_id, name in stale:
        logger.info("catch-up: syncing stale account %s #%s", name, account_id)
        run_sync_account(account_id)


def reset_interrupted_syncs() -> None:
    """A container stopped mid-sync leaves status 'syncing' forever — clear it
    at boot so catch-up (which skips in-flight syncs) isn't blocked."""
    try:
        with SessionLocal() as session:
            for acc in session.scalars(select(Account).where(Account.sync_status == "syncing")):
                acc.sync_status = "error"
                acc.last_error = "Sync interrupted by a restart — will catch up automatically."
            session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("reset of interrupted syncs failed: %s", exc)


def boot_catchup() -> None:
    reset_interrupted_syncs()
    job_catchup()


def start_scheduler() -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=get_settings().timezone)
    sched.add_job(
        lambda: run_sync("moodle"), "interval", hours=3, id="moodle", misfire_grace_time=600
    )
    sched.add_job(
        lambda: run_sync("classroom"), "interval", hours=3, id="classroom", misfire_grace_time=600
    )
    sched.add_job(
        lambda: run_sync("compasso"), "interval", hours=3, id="compasso", misfire_grace_time=600
    )
    # Local filesystem — cheap, so a tighter interval keeps cowork fresh.
    sched.add_job(
        lambda: run_sync("cowork"), "interval", hours=1, id="cowork", misfire_grace_time=600
    )
    # Interval jobs resume on wake, so this heals whatever the intervals missed.
    sched.add_job(job_catchup, "interval", minutes=10, id="catchup", misfire_grace_time=300)
    sched.start()
    return sched
