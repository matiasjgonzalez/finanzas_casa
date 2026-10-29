"""Contraseñas asignadas por otra persona (o la inicial admin/admin) deben cambiarse al ingresar."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import PASSWORD_CHANGE_REQUIRED
from app.cli import create_admin
from app.models import User
from tests.factories import PASSWORD, HouseholdData, create_household, create_user, login

NEW_PASSWORD = "mi-contraseña-definitiva"


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


def change_password(client: TestClient, current: str, new: str = NEW_PASSWORD):  # noqa: ANN201
    return client.post(
        "/api/auth/change-password", json={"current_password": current, "new_password": new}
    )


def test_default_admin_must_change_password_before_using_the_app(
    db: Session, client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    @contextmanager
    def session_factory() -> Iterator[Session]:
        yield db

    assert create_admin(session_factory, use_default=True) == 0
    assert "Usuario: admin / Contraseña: admin" in capsys.readouterr().out
    admin = db.scalars(select(User)).one()
    login(client, admin, password="admin")

    # Puede ver sus datos (para saber que debe cambiar la contraseña)…
    me = client.get("/api/auth/me").json()
    assert me["user"]["username"] == "admin"
    assert me["user"]["must_change_password"] is True
    # …pero nada más.
    blocked = client.get("/api/households")
    assert blocked.status_code == 403
    assert blocked.json() == {"detail": PASSWORD_CHANGE_REQUIRED}

    assert change_password(client, "admin").status_code == 204

    assert client.get("/api/households").status_code == 200
    assert client.get("/api/auth/me").json()["user"]["must_change_password"] is False


def test_user_created_by_admin_must_change_the_initial_password(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData
) -> None:
    admin_client = login(client_factory(), home.admin)
    created = admin_client.post(
        "/api/users",
        json={"username": "leo", "full_name": "Leo", "password": "contraseña-inicial"},
    ).json()
    assert created["must_change_password"] is True

    leo = db.get(User, created["id"])
    leo_client = login(client_factory(), leo, password="contraseña-inicial")
    assert leo_client.get("/api/audit-logs").json() == {"detail": PASSWORD_CHANGE_REQUIRED}

    assert change_password(leo_client, "contraseña-inicial").status_code == 204
    db.refresh(leo)
    assert leo.must_change_password is False


def test_password_reset_by_admin_must_be_changed(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    member = create_user(db, home.household)
    login(client, home.admin)

    client.post(f"/api/users/{member.id}/reset-password", json={"new_password": "asignada-1234"})

    db.refresh(member)
    assert member.must_change_password is True


def test_logout_is_allowed_while_password_change_is_pending(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    home.admin.must_change_password = True
    db.flush()
    login(client, home.admin)

    assert client.post("/api/auth/logout").status_code == 204


def test_new_password_must_differ_from_current(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    home.admin.must_change_password = True
    db.flush()
    login(client, home.admin)

    response = change_password(client, PASSWORD, new=PASSWORD)

    assert response.status_code == 422
    assert response.json() == {"detail": "La nueva contraseña tiene que ser distinta de la actual."}
