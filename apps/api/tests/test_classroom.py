import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from edu.connectors.classroom import coursework_rows, parse_due

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> list:
    return json.loads((FIXTURES / name).read_text())


def test_parse_due():
    coursework = load("classroom_coursework.json")
    assert parse_due(coursework[0]) == datetime(2026, 9, 2, 23, 0, tzinfo=UTC)
    # No dueTime → end of day UTC
    assert parse_due(coursework[1]) == datetime(2026, 9, 10, 23, 59, tzinfo=UTC)
    # No dueDate → None
    assert parse_due(coursework[2]) is None


def test_coursework_rows():
    rows = coursework_rows(load("classroom_coursework.json"), load("classroom_submissions.json"))
    by_id = {r["external_id"]: r for r in rows}

    turned_in = by_id["cw:cw-1"]
    assert turned_in["kind"] == "assignment"
    assert turned_in["source_done"] is True
    assert turned_in["source_status"] == "submitted"
    assert turned_in["max_grade"] == Decimal(10)

    graded = by_id["cw:cw-2"]
    assert graded["kind"] == "activity"
    assert graded["source_done"] is True
    assert graded["source_status"] == "graded"
    assert graded["grade"] == Decimal("8.5")

    untouched = by_id["cw:cw-3"]
    assert untouched["source_done"] is False
    assert untouched["source_status"] is None
    assert untouched["due_at"] is None
