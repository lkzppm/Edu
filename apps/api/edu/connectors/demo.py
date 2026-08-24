"""Demo seeding — realistic UFRJ-flavored courses/tasks with due dates relative
to now, so the dashboard demos well with zero credentials (mirrors Fin's demo
connector accounts). Idempotent: same external_ids upsert on every sync."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from edu.connectors.base import replace_grades, upsert_course, upsert_tasks
from edu.models import Account


def _g(external_id: str, name: str, grade: str | None, max_grade: str) -> dict:
    return {
        "external_id": external_id,
        "kind": "total" if external_id.endswith("total") else "item",
        "name": name,
        "grade": Decimal(grade) if grade is not None else None,
        "max_grade": Decimal(max_grade),
        "graded_at": _due(-5) if grade is not None else None,
        "url": None,
    }


def _due(days: float, hour: int = 23, minute: int = 59) -> datetime:
    day = datetime.now(UTC) + timedelta(days=days)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


_MOODLE = [
    {
        "external_id": "demo-calc3",
        "name": "Cálculo Diferencial e Integral III",
        "code": "MAC238",
        "tasks": [
            {
                "external_id": "assign:demo-1",
                "kind": "assignment",
                "title": "Lista 4 — Integrais de linha",
                "description": "Exercícios 1–12 do capítulo 16.",
                "due_at": _due(-2),
            },
            {
                "external_id": "assign:demo-2",
                "kind": "assignment",
                "title": "Lista 5 — Teorema de Green",
                "description": "Entrega pelo Moodle, PDF único.",
                "due_at": _due(3),
            },
            {
                "external_id": "event:demo-1",
                "kind": "exam",
                "title": "P2 — Cálculo III",
                "description": "Matéria: integrais múltiplas e de linha.",
                "due_at": _due(9, 10, 0),
            },
        ],
        "grades": [
            _g("gi:demo-1", "P1", "7.5", "10"),
            _g("gi:demo-2", "Lista 1–3", "9.0", "10"),
            _g("gi:demo-3", "P2", None, "10"),
            _g("gi:demo-total", "Total", "8.25", "10"),
        ],
    },
    {
        "external_id": "demo-comp1",
        "name": "Computação I",
        "code": "COS110",
        "tasks": [
            {
                "external_id": "assign:demo-3",
                "kind": "assignment",
                "title": "Trabalho 2 — Estruturas de dados em Python",
                "description": "Implementar fila e pilha com testes.",
                "due_at": _due(0.3),
            },
            {
                "external_id": "quiz:demo-1",
                "kind": "quiz",
                "title": "Quiz — Recursão",
                "description": "10 questões, tentativa única.",
                "due_at": _due(1),
                "source_done": True,
                "source_status": "completed",
            },
        ],
    },
    {
        "external_id": "demo-fis2",
        "name": "Física II",
        "code": "FIM230",
        "tasks": [
            {
                "external_id": "event:demo-2",
                "kind": "exam",
                "title": "Prova 1 — Termodinâmica",
                "description": "",
                "due_at": _due(16, 13, 0),
            },
            {
                "external_id": "assign:demo-4",
                "kind": "assignment",
                "title": "Relatório — Experimento de calorimetria",
                "description": "Dupla; modelo no Moodle.",
                "due_at": _due(6),
            },
        ],
    },
]

_CLASSROOM = [
    {
        "external_id": "demo-alglin",
        "name": "Álgebra Linear II",
        "code": "Turma 2026.2",
        "tasks": [
            {
                "external_id": "cw:demo-1",
                "kind": "assignment",
                "title": "Lista — Autovalores e autovetores",
                "description": "Enviar foto das resoluções.",
                "due_at": _due(2, 21, 0),
            },
            {
                "external_id": "cw:demo-2",
                "kind": "assignment",
                "title": "Trabalho — Diagonalização",
                "description": "",
                "due_at": _due(-1, 21, 0),
                "source_done": True,
                "source_status": "submitted",
            },
        ],
        "grades": [
            _g("cw:demo-1", "Lista — Autovalores e autovetores", "8.5", "10"),
            _g("cw:demo-2", "Trabalho — Diagonalização", None, "10"),
        ],
    },
    {
        "external_id": "demo-eng",
        "name": "Inglês Instrumental",
        "code": "Turma B",
        "tasks": [
            {
                "external_id": "cw:demo-3",
                "kind": "activity",
                "title": "Reading quiz — Unit 3",
                "description": "",
                "due_at": _due(5, 18, 0),
            },
            {
                "external_id": "cw:demo-4",
                "kind": "assignment",
                "title": "Essay draft",
                "description": "300 words, any topic from the list.",
                "due_at": None,
            },
        ],
    },
]


def _seed(session: Session, account: Account, data: list[dict]) -> None:
    for entry in data:
        course = upsert_course(
            session,
            account,
            external_id=entry["external_id"],
            name=entry["name"],
            code=entry["code"],
            url=None,
        )
        upsert_tasks(session, course, [dict(row) for row in entry["tasks"]])
        replace_grades(session, course, [dict(row) for row in entry.get("grades", [])])


def seed_moodle(session: Session, account: Account) -> None:
    _seed(session, account, _MOODLE)


def seed_classroom(session: Session, account: Account) -> None:
    _seed(session, account, _CLASSROOM)
