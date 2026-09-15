"""Compasso connector — parsing pinned to the real EEL580 page and sheet."""

from datetime import UTC, date, datetime
from pathlib import Path

from edu.connectors import compasso

FIXTURES = Path(__file__).parent / "fixtures"
CSV = (FIXTURES / "compasso_sheet.csv").read_text()

PAGE = """
<html><head><title>Laborat&oacute;rio de Computa&ccedil;&atilde;o Paralela e Sistemas M&oacute;veis - EEL580</title></head>
<body><iframe aria-label="Spreadsheet, Aula EEL580 2026-2"
 data-src="https://docs.google.com/spreadsheets/d/1NFS4Puw42eRlZcaxPI2GMZOAwnRTZIwxhApSkFmhTWI/htmlembed"></iframe></body></html>
"""

TODAY = date(2026, 8, 26)
TZ = "America/Sao_Paulo"


def _schedule():
    return compasso.parse_schedule(CSV, year_hint=2026, today=TODAY, tz=TZ, url="https://x")


def test_parse_page_extracts_name_code_sheet_and_year():
    page = compasso.parse_page(PAGE)
    assert page["code"] == "EEL580"
    assert page["name"] == "Laboratório de Computação Paralela e Sistemas Móveis"
    assert page["sheet_id"] == "1NFS4Puw42eRlZcaxPI2GMZOAwnRTZIwxhApSkFmhTWI"
    assert page["year_hint"] == 2026


def test_provas_become_exam_tasks():
    exams = [t for t in _schedule() if t["kind"] == "exam"]
    assert [(t["title"], t["external_id"]) for t in exams] == [
        ("1ª Prova", "exam:2026-10-08"),
        ("2ª Prova", "exam:2026-11-26"),
    ]


def test_entregas_are_assignments_and_praticas_activities():
    tasks = {t["external_id"]: t for t in _schedule()}
    entrega = tasks["extra:2026-09-10:entrega-praticas-dgemm-parcial"]
    assert entrega["kind"] == "assignment"
    assert entrega["title"] == "Entrega Práticas DGEMM Parcial"
    assert tasks["extra:2026-08-18:pratica-dgemm"]["kind"] == "activity"
    # The same entrega title on a later date stays a distinct task.
    assert "extra:2026-11-12:entrega-praticas-dgemm-parcial" in tasks


def test_notes_and_plain_lectures_are_not_tasks():
    titles = [t["title"] for t in _schedule()]
    assert "Aula remota devido a operação na Maré" not in titles  # note, not work
    assert "The Processor" not in titles  # lectures are schedule, not to-dos
    assert "Não houve aula" not in titles


def test_due_is_end_of_local_day_in_utc():
    exam = next(t for t in _schedule() if t["external_id"] == "exam:2026-10-08")
    # 23:59 America/Sao_Paulo (UTC-3) → 02:59 UTC next day.
    assert exam["due_at"] == datetime(2026, 10, 9, 2, 59, tzinfo=UTC)


def test_resolve_year_without_hint_picks_nearest():
    # An Aug–Dec sheet read in January still lands in the previous year.
    assert compasso.resolve_date(17, 12, None, date(2027, 1, 5)) == date(2026, 12, 17)
    assert compasso.resolve_date(8, 10, None, TODAY) == date(2026, 10, 8)
    assert compasso.resolve_date(30, 2, 2026, TODAY) is None


def test_sync_upserts_course_and_tasks_idempotently(session, monkeypatch):
    from edu.models import Account, Course, Task

    account = Account(
        connector="compasso",
        institution="Compasso UFRJ",
        display_name="Compasso EEL580",
        base_url="https://www.compasso.ufrj.br/disciplinas/eel580",
        config={"page_url": "https://www.compasso.ufrj.br/disciplinas/eel580"},
    )
    session.add(account)
    session.commit()
    monkeypatch.setattr(compasso, "fetch_page", lambda url: PAGE)
    monkeypatch.setattr(compasso, "fetch_csv", lambda sheet_id: CSV)

    compasso.sync(session, account)
    compasso.sync(session, account)  # second run must not duplicate

    course = session.query(Course).one()
    assert course.code == "EEL580"
    assert course.external_id == "page:eel580"
    tasks = session.query(Task).all()
    assert len(tasks) == len({t.external_id for t in tasks})
    assert sum(1 for t in tasks if t.kind == "exam") == 2
