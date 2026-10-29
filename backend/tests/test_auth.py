from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.models import LoginAttempt, UserSession
from tests.factories import PASSWORD, HouseholdData, create_household, create_user, login

INVALID = "Usuario o contraseña incorrectos."


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


def post_login(client: TestClient, username: str, password: str):  # noqa: ANN201
    return client.post("/api/auth/login", json={"username": username, "password": password})


# --- Inicio de sesión ----------------------------------------------------------------------


def test_login_returns_user_and_sets_secure_cookies(
    client: TestClient, home: HouseholdData
) -> None:
    response = post_login(client, home.admin.username, PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == home.admin.username
    assert body["user"]["role"] == "admin"
    assert body["household"]["currency"] == "ARS"
    assert "password_hash" not in body["user"]

    cookies = {c.split("=", 1)[0]: c for c in response.headers.get_list("set-cookie")}
    assert "HttpOnly" in cookies["ff_session"]
    assert "samesite=lax" in cookies["ff_session"].lower()
    # El token CSRF debe ser legible por el frontend (no HttpOnly).
    assert "HttpOnly" not in cookies["ff_csrf"]


def test_password_is_stored_with_argon2(home: HouseholdData) -> None:
    assert home.admin.password_hash.startswith("$argon2id$")
    assert PASSWORD not in home.admin.password_hash


def test_session_token_is_stored_only_as_hash(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    post_login(client, home.admin.username, PASSWORD)
    token = client.cookies["ff_session"]

    stored = db.scalars(select(UserSession.token_hash)).all()
    assert token not in stored
    assert hash_token(token) in stored


def test_login_ignores_username_case_and_spaces(client: TestClient, home: HouseholdData) -> None:
    response = post_login(client, f"  {home.admin.username.upper()} ", PASSWORD)

    assert response.status_code == 200


@pytest.mark.parametrize("scenario", ["wrong_password", "unknown_username", "inactive_user"])
def test_failed_login_gives_the_same_generic_message(
    client: TestClient, db: Session, home: HouseholdData, scenario: str
) -> None:
    """No revela si el username existe ni si la cuenta está desactivada."""
    username, password = home.admin.username, PASSWORD
    if scenario == "wrong_password":
        password = "otra-contraseña"
    elif scenario == "unknown_username":
        username = "nadie"
    else:
        username = create_user(db, home.household, is_active=False).username

    response = post_login(client, username, password)

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID}
    assert "ff_session" not in client.cookies


def test_failed_attempts_are_recorded(client: TestClient, db: Session, home: HouseholdData) -> None:
    post_login(client, home.admin.username, "incorrecta")

    attempt = db.scalars(select(LoginAttempt)).one()
    assert attempt.username == home.admin.username
    assert attempt.succeeded is False


def test_too_many_failures_block_login_even_with_correct_password(
    client: TestClient, home: HouseholdData
) -> None:
    for _ in range(5):
        assert post_login(client, home.admin.username, "incorrecta").status_code == 401

    response = post_login(client, home.admin.username, PASSWORD)

    assert response.status_code == 429
    assert "Demasiados intentos" in response.json()["detail"]
    assert int(response.headers["Retry-After"]) > 0


def test_old_failures_outside_the_window_do_not_block(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    old = datetime.now(UTC) - timedelta(minutes=16)
    db.add_all(
        LoginAttempt(
            username=home.admin.username, ip_address="1.2.3.4", succeeded=False, created_at=old
        )
        for _ in range(5)
    )
    db.flush()

    assert post_login(client, home.admin.username, PASSWORD).status_code == 200


# --- Sesión --------------------------------------------------------------------------------


def test_me_requires_login(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Iniciá sesión para continuar."}


def test_me_returns_current_user(client: TestClient, home: HouseholdData) -> None:
    login(client, home.admin)

    assert client.get("/api/auth/me").json()["user"]["id"] == str(home.admin.id)


def test_forged_session_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("ff_session", "token-inventado")

    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db: Session, home: HouseholdData) -> None:
    login(client, home.admin)
    session = db.scalars(select(UserSession)).one()
    session.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.flush()

    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_the_session(client: TestClient, home: HouseholdData) -> None:
    login(client, home.admin)
    token = client.cookies["ff_session"]

    assert client.post("/api/auth/logout").status_code == 204

    # Aunque alguien hubiera copiado la cookie, ya no sirve.
    client.cookies.set("ff_session", token)
    assert client.get("/api/auth/me").status_code == 401


def test_deactivated_user_loses_access_immediately(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData
) -> None:
    member = create_user(db, home.household)
    member_client = login(client_factory(), member)
    admin_client = login(client_factory(), home.admin)

    admin_client.patch(f"/api/users/{member.id}", json={"is_active": False})

    assert member_client.get("/api/auth/me").status_code == 401


# --- CSRF ----------------------------------------------------------------------------------


def test_unsafe_requests_without_csrf_token_are_rejected(
    client: TestClient, home: HouseholdData
) -> None:
    login(client, home.admin)
    del client.headers["X-CSRF-Token"]

    response = client.post("/api/auth/logout")

    assert response.status_code == 403
    assert "seguridad" in response.json()["detail"]


def test_unsafe_requests_with_wrong_csrf_token_are_rejected(
    client: TestClient, home: HouseholdData
) -> None:
    login(client, home.admin)
    client.headers["X-CSRF-Token"] = "token-de-otro-sitio"

    assert client.post("/api/auth/logout").status_code == 403


def test_safe_requests_do_not_need_csrf_token(client: TestClient, home: HouseholdData) -> None:
    login(client, home.admin)
    del client.headers["X-CSRF-Token"]

    assert client.get("/api/auth/me").status_code == 200


# --- Cambio de contraseña ------------------------------------------------------------------


def test_change_password_requires_current_password(client: TestClient, home: HouseholdData) -> None:
    login(client, home.admin)

    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "incorrecta", "new_password": "una-nueva-contraseña"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "La contraseña actual no es correcta."}


def test_change_password_keeps_this_session_and_closes_the_others(
    client_factory: Callable[[], TestClient], home: HouseholdData
) -> None:
    phone = login(client_factory(), home.admin)
    laptop = login(client_factory(), home.admin)

    response = laptop.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "una-nueva-contraseña"},
    )

    assert response.status_code == 204
    assert laptop.get("/api/auth/me").status_code == 200
    assert phone.get("/api/auth/me").status_code == 401
    fresh = client_factory()
    assert post_login(fresh, home.admin.username, "una-nueva-contraseña").status_code == 200


def test_new_password_must_have_minimum_length(client: TestClient, home: HouseholdData) -> None:
    login(client, home.admin)

    response = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "corta"},
    )

    assert response.status_code == 422
