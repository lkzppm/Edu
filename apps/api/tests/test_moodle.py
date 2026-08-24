import json
from datetime import UTC, datetime
from pathlib import Path

from edu.connectors.moodle import (
    _flatten,
    apply_completion,
    assignment_rows,
    event_rows,
    parse_course_names,
    parse_submission,
    quiz_rows,
)

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "https://moodle.example/"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_assignment_rows():
    rows = assignment_rows(BASE, load("moodle_assignments.json"))["42"]
    assert [r["external_id"] for r in rows] == ["assign:7", "assign:8"]
    lista4 = rows[0]
    assert lista4["kind"] == "assignment"
    assert lista4["due_at"] == datetime.fromtimestamp(1767225600, UTC)
    assert lista4["url"] == "https://moodle.example/mod/assign/view.php?id=301"
    # HTML stripped, entities unescaped, whitespace collapsed
    assert lista4["description"] == "Exercícios 1–12 do cap. 16."
    # duedate 0 → no due date
    assert rows[1]["due_at"] is None


def test_quiz_rows():
    rows = quiz_rows(BASE, load("moodle_quizzes.json"))["42"]
    assert rows[0]["external_id"] == "quiz:3"
    assert rows[0]["kind"] == "quiz"
    assert rows[0]["due_at"] == datetime.fromtimestamp(1767312000, UTC)
    assert rows[0]["url"] == "https://moodle.example/mod/quiz/view.php?id=310"


def test_event_rows_classification():
    rows = event_rows(load("moodle_events.json"))
    ids = [r["external_id"] for r in rows["42"]]
    # assign-module dupe (901) skipped; site event (903, courseid 0) skipped
    assert ids == ["event:900", "event:902"]
    kinds = {r["external_id"]: r["kind"] for r in rows["42"]}
    assert kinds["event:900"] == "exam"  # "P2" matches the exam pattern
    assert kinds["event:902"] == "event"


def test_apply_completion():
    rows = assignment_rows(BASE, load("moodle_assignments.json"))["42"]
    apply_completion(rows, {301})
    assert rows[0]["source_done"] is True
    assert rows[0]["source_status"] == "completed"
    assert "source_done" not in rows[1]


def test_parse_course_names_real_sites():
    # Moodle UFRJ (2026-08-21): code+term first, shortname is code+term.
    assert parse_course_names("COS242 - 2026/2 - Teoria dos Grafos (ECI)", "COS242 - 2026/2") == (
        "Teoria dos Grafos (ECI)",
        "COS242",
    )
    assert parse_course_names("EEL873 - 2026/2 - Engenharia de Software", "EEL873 - 2026/2") == (
        "Engenharia de Software",
        "EEL873",
    )
    # Polimoodle: term first, code last, shortname is the bare name.
    assert parse_course_names(
        "2026/2 - Sistemas Operacionais - EEL770", "Sistemas Operacionais"
    ) == (
        "Sistemas Operacionais",
        "EEL770",
    )


def test_parse_course_names_fallbacks():
    # No code anywhere → name passes through, code-like shortname wins.
    assert parse_course_names("Inglês Instrumental", "ING-INS") == (
        "Inglês Instrumental",
        "ING-INS",
    )
    # Long/spacey shortname is not a code.
    assert parse_course_names("Física Experimental", "Física Experimental") == (
        "Física Experimental",
        None,
    )
    # Degenerate: fullname is only the code.
    assert parse_course_names("COS110", "COS110") == ("COS110", "COS110")


def test_parse_submission():
    # Polimoodle real shape (2026-08-21): delivered but not graded.
    assert parse_submission({"lastattempt": {"submission": {"status": "submitted"}}}) == (
        True,
        "submitted",
    )
    assert parse_submission(
        {
            "lastattempt": {"submission": {"status": "submitted"}},
            "feedback": {"grade": {"grade": "8.5"}},
        }
    ) == (True, "graded")
    # Group assignments deliver through teamsubmission.
    assert parse_submission({"lastattempt": {"teamsubmission": {"status": "submitted"}}}) == (
        True,
        "submitted",
    )
    assert parse_submission({"lastattempt": {"submission": {"status": "new"}}}) == (False, None)
    assert parse_submission({}) == (False, None)


def test_flatten_moodle_params():
    flat = _flatten(
        {"userid": 1, "courseids": [4, 5], "events": {"courseids": [4]}, "options": {"x": 0}}
    )
    assert flat == {
        "userid": 1,
        "courseids[0]": 4,
        "courseids[1]": 5,
        "events[courseids][0]": 4,
        "options[x]": 0,
    }
