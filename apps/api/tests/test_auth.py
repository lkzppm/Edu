"""A dead credential is its own failure mode: connectors raise AuthError, the
sync parks the account in `sync_status="auth"` (data intact) and it waits for a
new credential instead of retrying forever."""

import httpx
import pytest
from sqlalchemy.orm import sessionmaker

from edu.connectors import SYNCERS, base, classroom, moodle
from edu.connectors.base import AuthError, ConnectorError, run_sync_account


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._payload


def post_returning(monkeypatch, module, payload: dict, status_code: int = 200) -> None:
    monkeypatch.setattr(
        module.httpx, "post", lambda *a, **k: FakeResponse(payload, status_code), raising=True
    )


# ── moodle ────────────────────────────────────────────────────


def test_call_raises_auth_error_on_dead_token(monkeypatch):
    post_returning(
        monkeypatch,
        moodle,
        {
            "exception": "webservice_access_exception",
            "errorcode": "invalidtoken",
            "message": "Invalid token - token not found",
        },
    )
    with pytest.raises(AuthError):
        moodle.call("https://moodle.example", "dead", "core_webservice_get_site_info")


def test_call_keeps_other_moodle_exceptions_transient(monkeypatch):
    post_returning(
        monkeypatch, moodle, {"exception": "moodle_exception", "errorcode": "nopermissions"}
    )
    with pytest.raises(ConnectorError) as exc:
        moodle.call("https://moodle.example", "t", "mod_quiz_get_quizzes_by_courses")
    assert not isinstance(exc.value, AuthError)


def test_unreachable_is_not_an_auth_failure(monkeypatch):
    """An expired site certificate is a transport problem — a new token would
    not fix it, so it must not park the account."""

    def boom(*a, **k):
        raise httpx.ConnectError("certificate has expired")

    monkeypatch.setattr(moodle.httpx, "post", boom)
    with pytest.raises(ConnectorError) as exc:
        moodle.call("https://moodle.example", "t", "core_webservice_get_site_info")
    assert not isinstance(exc.value, AuthError)


def test_fetch_token_rejection_is_an_auth_error(monkeypatch):
    post_returning(monkeypatch, moodle, {"error": "Invalid login, please try again"})
    with pytest.raises(AuthError):
        moodle.fetch_token("https://moodle.example", "lucas", "wrong")


# ── classroom ─────────────────────────────────────────────────


def test_revoked_refresh_token_is_an_auth_error(monkeypatch):
    post_returning(monkeypatch, classroom, {"error": "invalid_grant"}, status_code=400)
    with pytest.raises(AuthError):
        classroom._token_request({"grant_type": "refresh_token", "refresh_token": "gone"})


def test_other_oauth_failures_stay_transient(monkeypatch):
    post_returning(monkeypatch, classroom, {"error": "server_error"}, status_code=500)
    with pytest.raises(ConnectorError) as exc:
        classroom._token_request({"grant_type": "refresh_token", "refresh_token": "x"})
    assert not isinstance(exc.value, AuthError)


# ── status mapping ────────────────────────────────────────────


def _run_against(session, monkeypatch, account, exc: Exception) -> None:
    """run_sync_account opens its own session — point it at the test engine."""
    monkeypatch.setattr(
        base, "SessionLocal", sessionmaker(bind=session.get_bind(), expire_on_commit=False)
    )

    def raiser(_session, _account):
        raise exc

    monkeypatch.setitem(SYNCERS, "moodle", raiser)
    run_sync_account(account.id)
    session.expire_all()


def test_auth_error_parks_the_account(session, account, monkeypatch):
    _run_against(session, monkeypatch, account, AuthError("Moodle rejected the token: gone"))
    assert account.sync_status == "auth"
    assert "rejected the token" in account.last_error


def test_other_failures_stay_error(session, account, monkeypatch):
    _run_against(session, monkeypatch, account, ConnectorError("Moodle unreachable: timeout"))
    assert account.sync_status == "error"
