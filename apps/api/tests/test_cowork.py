"""Cowork connector — pattern parsing, workspace scan, course linking."""

import pytest

from edu.connectors import cowork
from edu.connectors.base import ConnectorError
from edu.models import Account, Course, SemesterClass, WorkItem
from edu.routes.college import load_plan

CONTEXT = """---
code: EEL770
name: Sistemas Operacionais
semester: 2026-2
turma: "9744"
credits: 5
kind: obrigatoria
period: 5
professor: Pedro Henrique Cruz Caminha
contact: cruz@gta.ufrj.br
evaluation: "Laboratórios + questionários semanais — sem prova"
platform: polimoodle
platform_url: https://moodle.poli.ufrj.br/course/view.php?id=227
schedule:
  - {day: tue, start: "15:00", end: "18:00", room: H-213}
  - {day: thu, start: "15:00", end: "17:00", room: H-213}
---

# EEL770 — prosa livre que o conector nunca lê.
"""

CONTEXT_NO_PLATFORM = """---
code: EEL878
name: Redes de Computadores I
credits: 4
kind: obrigatoria
platform: none
schedule:
  - {day: mon, start: "15:00", end: "17:00", room: H-325}
---
corpo
"""


@pytest.fixture
def workspace(tmp_path):
    classes = tmp_path / "classes"
    so = classes / "EEL770_Sistemas_Operacionais"
    so.mkdir(parents=True)
    (so / "CONTEXT.md").write_text(CONTEXT)
    lista = so / "listas" / "2026-08-23_Lab-01-Processos"
    lista.mkdir(parents=True)
    (lista / "relatorio.html").write_text("x")
    (lista / "EEL770_Lab01.pdf").write_text("x")
    redes = classes / "EEL878_Redes_de_Computadores_I"
    redes.mkdir()
    (redes / "CONTEXT.md").write_text(CONTEXT_NO_PLATFORM)
    (classes / "EEL999_Sem_Frontmatter").mkdir()
    (classes / "EEL999_Sem_Frontmatter" / "CONTEXT.md").write_text("# sem contrato")
    (classes / "notas_soltas").mkdir()  # doesn't match CODE_Name — ignored
    return tmp_path


def test_frontmatter_contract_is_parsed(workspace):
    classes, _items = cowork.scan_workspace(workspace)
    assert [c["code"] for c in classes] == ["EEL770", "EEL878"]
    so = classes[0]
    assert so["name"] == "Sistemas Operacionais"
    assert so["credits"] == 5 and so["period"] == 5
    assert so["schedule"][0] == {"day": "tue", "start": "15:00", "end": "18:00", "room": "H-213"}
    assert classes[1]["platform"] is None  # "none" normalizes to null


def test_listas_folders_become_work_items(workspace):
    _, items = cowork.scan_workspace(workspace)
    assert len(items) == 1
    item = items[0]
    assert item["class_code"] == "EEL770"
    assert item["date"].date().isoformat() == "2026-08-23"
    assert item["title"] == "Lab 01 Processos"
    assert item["files"] == 2 and item["has_pdf"] is True


def test_missing_workspace_raises_a_clear_error(tmp_path):
    with pytest.raises(ConnectorError, match="not mounted"):
        cowork.scan_workspace(tmp_path / "nope")


def test_norm_url_aliases_polimoodle_host():
    a = cowork.norm_url("https://polimoodle.poli.ufrj.br/course/view.php?id=227")
    b = cowork.norm_url("https://moodle.poli.ufrj.br/course/view.php?id=227/")
    assert a == b


def test_sync_replaces_registry_and_links_courses(session, workspace, monkeypatch):
    account = Account(
        connector="cowork",
        institution="Claude Cowork",
        display_name="Claude Cowork",
        config={"dir": str(workspace)},
    )
    moodle = Account(
        connector="moodle", institution="Poli", display_name="Polimoodle", config={}
    )
    session.add_all([account, moodle])
    session.commit()
    # One course matches by code, one by URL, one matches nothing.
    session.add_all(
        [
            Course(account_id=moodle.id, external_id="1", name="SO", code="EEL770"),
            Course(
                account_id=moodle.id,
                external_id="2",
                name="Redes",
                code=None,
                url="https://moodle.poli.ufrj.br/course/view.php?id=227",
            ),
            Course(account_id=moodle.id, external_id="3", name="Outro", code="XXX999"),
        ]
    )
    session.commit()

    cowork.sync(session, account)
    cowork.sync(session, account)  # idempotent

    assert {sc.code for sc in session.query(SemesterClass)} == {"EEL770", "EEL878"}
    assert session.query(WorkItem).count() == 1
    linked = {c.external_id: c.class_code for c in session.query(Course)}
    assert linked == {"1": "EEL770", "2": "EEL770", "3": None}


def test_degree_plan_loads_with_summary():
    plan = load_plan()
    summary = plan["summary"]
    assert summary["counts"]["dispensada"] == 23
    assert summary["counts"]["em_curso"] == 6
    assert len(plan["forward"]) == 4
    assert 0 < summary["done_pct"] < 100
