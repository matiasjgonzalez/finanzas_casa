"""Gestión de usuarios: permisos de cada rol y aislamiento entre hogares."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.models.enums import UserRole
from tests.factories import PASSWORD, HouseholdData, create_household, create_user, login

NEW_USER = {
    "username": "Nueva.Persona",
    "full_name": "  Nueva Persona ",
    "password": "una-contraseña-larga",
}


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def admin_client(client_factory: Callable[[], TestClient], home: HouseholdData) -> TestClient:
    return login(client_factory(), home.admin)


@pytest.fixture
def member(db: Session, home: HouseholdData) -> User:
    return create_user(db, home.household)


@pytest.fixture
def member_client(client_factory: Callable[[], TestClient], member: User) -> TestClient:
    return login(client_factory(), member)


# --- Administrador -------------------------------------------------------------------------


def test_admin_creates_a_member_who_can_log_in(
    admin_client: TestClient, client_factory: Callable[[], TestClient]
) -> None:
    response = admin_client.post("/api/users", json=NEW_USER)

    assert response.status_code == 201
    created = response.json()
    assert created["username"] == "nueva.persona"
    assert created["full_name"] == "Nueva Persona"
    assert created["role"] == "member"
    assert "password" not in created and "password_hash" not in created

    new_client = client_factory()
    login_response = new_client.post(
        "/api/auth/login", json={"username": NEW_USER["username"], "password": NEW_USER["password"]}
    )
    assert login_response.status_code == 200


def test_admin_lists_only_users_of_own_household(
    admin_client: TestClient, db: Session, home: HouseholdData, member: User
) -> None:
    other = create_household(db, name="Otro hogar")

    usernames = {u["username"] for u in admin_client.get("/api/users").json()}

    assert usernames == {home.admin.username, member.username}
    assert other.admin.username not in usernames


def test_username_must_be_unique_ignoring_case(admin_client: TestClient, member: User) -> None:
    response = admin_client.post(
        "/api/users", json={**NEW_USER, "username": member.username.upper()}
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Ese nombre de usuario ya está en uso."}


@pytest.mark.parametrize(
    "field, value",
    [
        ("password", "corta"),
        ("username", "con espacio"),
        ("username", "ab"),
        ("username", "maría"),
        ("full_name", "   "),
        ("role", "superuser"),
    ],
)
def test_invalid_user_data_is_rejected(admin_client: TestClient, field: str, value: str) -> None:
    response = admin_client.post("/api/users", json={**NEW_USER, field: value})

    assert response.status_code == 422


def test_admin_edits_a_user(admin_client: TestClient, member: User) -> None:
    response = admin_client.patch(
        f"/api/users/{member.id}", json={"full_name": "Nombre corregido", "role": "admin"}
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Nombre corregido"
    assert response.json()["role"] == "admin"


def test_admin_resets_a_password_and_old_sessions_are_closed(
    admin_client: TestClient,
    member: User,
    member_client: TestClient,
    client_factory: Callable[[], TestClient],
) -> None:
    response = admin_client.post(
        f"/api/users/{member.id}/reset-password", json={"new_password": "otra-contraseña-larga"}
    )

    assert response.status_code == 204
    assert member_client.get("/api/auth/me").status_code == 401
    fresh = client_factory()
    assert (
        fresh.post(
            "/api/auth/login",
            json={"username": member.username, "password": "otra-contraseña-larga"},
        ).status_code
        == 200
    )


# --- Siempre debe quedar un administrador activo -------------------------------------------


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": "member"}])
def test_the_only_admin_cannot_deactivate_or_demote_themself(
    admin_client: TestClient, home: HouseholdData, change: dict[str, object]
) -> None:
    response = admin_client.patch(f"/api/users/{home.admin.id}", json=change)

    assert response.status_code == 409
    assert "al menos un administrador activo" in response.json()["detail"]
    assert admin_client.get("/api/auth/me").json()["user"]["role"] == "admin"


def test_admin_can_step_down_when_another_admin_exists(
    admin_client: TestClient, db: Session, home: HouseholdData
) -> None:
    create_user(db, home.household, role=UserRole.ADMIN)

    response = admin_client.patch(f"/api/users/{home.admin.id}", json={"role": "member"})

    assert response.status_code == 200


def test_an_inactive_admin_does_not_count_as_active(
    admin_client: TestClient, db: Session, home: HouseholdData
) -> None:
    create_user(db, home.household, role=UserRole.ADMIN, is_active=False)

    response = admin_client.patch(f"/api/users/{home.admin.id}", json={"is_active": False})

    assert response.status_code == 409


# --- Usuario familiar ----------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path_template, body",
    [
        ("GET", "/api/users", None),
        ("POST", "/api/users", NEW_USER),
        ("GET", "/api/users/{id}", None),
        ("PATCH", "/api/users/{id}", {"role": "admin"}),
        ("POST", "/api/users/{id}/reset-password", {"new_password": "una-contraseña-larga"}),
        ("GET", "/api/audit-logs", None),
    ],
)
def test_member_cannot_use_admin_endpoints(
    member_client: TestClient,
    member: User,
    method: str,
    path_template: str,
    body: dict[str, object] | None,
) -> None:
    response = member_client.request(method, path_template.format(id=member.id), json=body)

    assert response.status_code == 403
    assert response.json() == {"detail": "Solo un administrador puede realizar esta acción."}


def test_member_cannot_promote_themself(
    member_client: TestClient, db: Session, member: User
) -> None:
    member_client.patch(f"/api/users/{member.id}", json={"role": "admin"})

    db.refresh(member)
    assert member.role == UserRole.MEMBER


def test_anonymous_requests_are_rejected(client: TestClient, member: User) -> None:
    assert client.get("/api/users").status_code == 401
    assert client.get(f"/api/users/{member.id}").status_code == 401


def test_any_member_can_list_household_members_without_access_data(
    member_client: TestClient, db: Session, home: HouseholdData, member: User
) -> None:
    create_household(db, name="Otro hogar")

    members = member_client.get("/api/members").json()

    assert {m["full_name"] for m in members} == {home.admin.full_name, member.full_name}
    assert set(members[0]) == {"id", "full_name", "is_active"}


# --- Aislamiento entre hogares -------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path_template, body",
    [
        ("GET", "/api/users/{id}", None),
        ("PATCH", "/api/users/{id}", {"full_name": "Hackeado"}),
        ("POST", "/api/users/{id}/reset-password", {"new_password": "contraseña-del-atacante"}),
    ],
)
def test_admin_of_another_household_cannot_access_our_users(
    client_factory: Callable[[], TestClient],
    db: Session,
    member: User,
    method: str,
    path_template: str,
    body: dict[str, object] | None,
) -> None:
    """Cambiar el identificador en la URL no permite ver ni modificar datos de otro hogar."""
    intruder = create_household(db, name="Hogar ajeno")
    intruder_client = login(client_factory(), intruder.admin)

    response = intruder_client.request(method, path_template.format(id=member.id), json=body)

    assert response.status_code == 404
    db.refresh(member)
    assert member.full_name != "Hackeado"
    login(client_factory(), member, PASSWORD)  # la contraseña original sigue funcionando


# --- Historial de acciones -----------------------------------------------------------------


def test_admin_actions_are_recorded_in_the_audit_log(
    admin_client: TestClient, db: Session, home: HouseholdData
) -> None:
    created = admin_client.post("/api/users", json=NEW_USER).json()
    admin_client.patch(f"/api/users/{created['id']}", json={"is_active": False})

    actions = db.scalars(
        select(AuditLog.action).where(AuditLog.entity_id == created["id"]).order_by(AuditLog.id)
    ).all()
    assert actions == ["user.created", "user.updated"]

    logs = admin_client.get("/api/audit-logs").json()
    assert logs["total"] >= 2
    assert logs["items"][0]["action"] == "user.updated"
    assert logs["items"][0]["actor_name"] == home.admin.full_name
    assert logs["items"][0]["details"] == {"is_active": {"from": "True", "to": "False"}}


def test_audit_log_never_contains_passwords(admin_client: TestClient, db: Session) -> None:
    created = admin_client.post("/api/users", json=NEW_USER).json()
    admin_client.post(
        f"/api/users/{created['id']}/reset-password", json={"new_password": "otra-contraseña-larga"}
    )

    dump = str([(log.action, log.details) for log in db.scalars(select(AuditLog))])
    assert NEW_USER["password"] not in dump
    assert "otra-contraseña-larga" not in dump


def test_audit_log_only_shows_own_household(
    admin_client: TestClient, client_factory: Callable[[], TestClient], db: Session
) -> None:
    other = create_household(db, name="Otro hogar")
    other_client = login(client_factory(), other.admin)
    other_client.post("/api/users", json={**NEW_USER, "username": "ajeno"})

    actions = [
        (item["action"], item["details"])
        for item in admin_client.get("/api/audit-logs").json()["items"]
    ]
    assert all("ajeno" not in str(details) for _, details in actions)
