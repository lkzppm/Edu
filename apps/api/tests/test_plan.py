"""The degree plan in the DB (2026-09-14): the bundled YAML seeds it, the
road to graduation is derived from `planned`, edits round-trip through
export/import."""

from edu.models import PlanCourse
from edu.plan import SEED_PATH, build, export_yaml, import_yaml, seed_if_empty


def test_seed_imports_the_legacy_yaml(session):
    assert seed_if_empty(session) is True
    assert seed_if_empty(session) is False  # only when empty
    plan = build(session)
    summary = plan["summary"]
    assert summary["counts"]["done"] == 23
    assert summary["counts"]["current"] == 6
    assert 0 < summary["done_pct"] < 100
    assert [p["period"] for p in plan["periods"]] == list(range(1, 10))
    # Forward list folded into the courses: roles/unlocks land on the row…
    eel871 = session.get(PlanCourse, "EEL871")
    assert eel871.role == "ancora" and eel871.unlocks == "COS480"
    # …an optative outside the curriculum becomes an extra in course…
    eel874 = session.get(PlanCourse, "EEL874")
    assert eel874.period is None and eel874.status == "current"
    assert eel874.counts_for == "optativas"
    # …and the road is derived: current semester first, then planned ones.
    road = plan["road"]
    assert road[0]["semester"] == "2026/2" and road[0]["current"]
    assert [s["semester"] for s in road] == ["2026/2", "2027/1", "2027/2", "2028/1"]
    assert {c["code"] for c in road[1]["courses"]} >= {"COS480", "COS482", "EEL879"}
    # Non-course entries (defense, ACE) ride along as semester items.
    last = road[-1]
    assert any(i.get("role") == "ace" for i in last["items"])
    assert any("defesa" in (i.get("name") or "") for i in last["items"])


def test_requirements_computed_or_stored(session):
    seed_if_empty(session)
    reqs = {r["key"]: r for r in build(session)["requirements"]}
    assert reqs["obrigatorias"]["computed"] is True
    assert reqs["obrigatorias"]["done"] == build(session)["summary"]["credits"]["done"]
    assert reqs["optativas"]["computed"] is False and reqs["optativas"]["in_course"] == 4


def test_export_round_trips(session):
    seed_if_empty(session)
    before = build(session)
    text = export_yaml(session)
    assert "courses:" in text and "dispensada" not in text  # semantic statuses only
    import_yaml(session, text, replace=True)
    after = build(session)
    assert after["summary"] == before["summary"]
    assert [s["semester"] for s in after["road"]] == [s["semester"] for s in before["road"]]
    assert after["requirements"] == before["requirements"]


def test_plan_edits_via_api(session):
    from fastapi.testclient import TestClient

    from edu.db import get_db
    from edu.main import app

    seed_if_empty(session)
    app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(app)
        # Move a course to another semester — the road follows.
        res = client.put("/college/plan/courses/cos360", json={"planned": "2027/2"})
        assert res.status_code == 200 and res.json()["planned"] == "2027/2"
        road = {s["semester"]: s for s in client.get("/college/plan").json()["road"]}
        assert "COS360" in {c["code"] for c in road["2027/2"]["courses"]}
        # A new optative needs a name; then it counts where told.
        assert client.put("/college/plan/courses/COS999", json={"credits": 4}).status_code == 422
        res = client.put(
            "/college/plan/courses/COS999",
            json={"name": "Tópicos", "credits": 4, "status": "done", "counts_for": "optativas"},
        )
        assert res.status_code == 200
        client.patch("/college/plan/requirements/optativas", json={"computed": True})
        reqs = {r["key"]: r for r in client.get("/college/plan").json()["requirements"]}
        assert reqs["optativas"]["done"] == 4
        # Meta + delete.
        client.patch("/college/plan/meta", json={"graduation_target": "2028/2", "dre": None})
        meta = client.get("/college/plan").json()["meta"]
        assert meta["graduation_target"] == "2028/2" and "dre" not in meta
        assert client.delete("/college/plan/courses/COS999").status_code == 200
        assert client.delete("/college/plan/courses/COS999").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_seed_file_present():
    assert SEED_PATH.exists()
