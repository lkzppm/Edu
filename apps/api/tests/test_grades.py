from decimal import Decimal

from sqlalchemy import select

from edu.connectors.base import replace_grades, upsert_course
from edu.connectors.classroom import grade_rows_from_coursework
from edu.connectors.moodle import grade_rows
from edu.models import GradeItem

# Real Polimoodle/UFRJ shape (probed 2026-08-24).
PAYLOAD = {
    "usergrades": [
        {
            "courseid": 42,
            "gradeitems": [
                {
                    "id": 3085,
                    "itemname": "",
                    "itemtype": "category",
                    "graderaw": None,
                    "grademax": 6.5,
                },
                {
                    "id": 3323,
                    "itemname": "Conjunto 1",
                    "itemtype": "manual",
                    "graderaw": 0.4,
                    "grademax": 0.5,
                    "gradedategraded": 1787081058,
                },
                {
                    "id": 2840,
                    "itemname": "Projeto",
                    "itemtype": "mod",
                    "itemmodule": "assign",
                    "cmid": 22497,
                    "graderaw": None,
                    "grademax": 100,
                    "gradedategraded": None,
                },
                {
                    "id": 2838,
                    "itemname": None,
                    "itemtype": "course",
                    "graderaw": 7.9,
                    "grademax": 10,
                },
            ],
        }
    ]
}


def test_moodle_grade_rows():
    rows = grade_rows("https://moodle.example/", PAYLOAD)
    assert [r["external_id"] for r in rows] == ["gi:3323", "gi:2840", "gi:2838"]
    conjunto = rows[0]
    assert conjunto["kind"] == "item"
    assert conjunto["grade"] == Decimal("0.4")
    assert conjunto["max_grade"] == Decimal("0.5")
    assert conjunto["graded_at"] is not None
    assert conjunto["url"] is None  # manual item — no course module to link
    projeto = rows[1]
    assert projeto["grade"] is None  # ungraded kept, category dropped
    assert projeto["graded_at"] is None
    assert projeto["url"] == "https://moodle.example/mod/assign/view.php?id=22497"
    total = rows[2]
    assert total["kind"] == "total"
    assert total["name"] == "Total"
    assert total["grade"] == Decimal("7.9")


def test_classroom_grade_rows():
    coursework = [
        {
            "external_id": "cw:1",
            "title": "Lista",
            "grade": Decimal("8.5"),
            "max_grade": Decimal(10),
        },
        {"external_id": "cw:2", "title": "Essay", "grade": None, "max_grade": Decimal(10)},
        {"external_id": "cw:3", "title": "Ungradable", "grade": None, "max_grade": None},
    ]
    rows = grade_rows_from_coursework(coursework)
    assert [r["external_id"] for r in rows] == ["cw:1", "cw:2"]  # point-less coursework dropped


def test_replace_grades_upserts_and_deletes(session, account):
    course = upsert_course(session, account, external_id="42", name="SO", code="EEL770")
    replace_grades(session, course, grade_rows("https://moodle.example/", PAYLOAD))
    assert session.scalar(select(GradeItem).where(GradeItem.external_id == "gi:2840")) is not None

    # Gradebook restructured: item 2840 gone, 3323 got graded higher.
    smaller = {
        "usergrades": [
            {
                "gradeitems": [
                    {
                        "id": 3323,
                        "itemname": "Conjunto 1",
                        "itemtype": "manual",
                        "graderaw": 0.5,
                        "grademax": 0.5,
                    }
                ]
            }
        ]
    }
    replace_grades(session, course, grade_rows("https://moodle.example/", smaller))
    items = list(session.scalars(select(GradeItem)))
    assert len(items) == 1
    assert items[0].grade == Decimal("0.5")
