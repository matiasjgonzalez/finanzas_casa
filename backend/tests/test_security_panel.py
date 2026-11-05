"""Panel de seguridad del superadmin: motivo de cada intento, bloqueos, avisos y desbloqueo."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, LoginAttempt, User
from app.models.enums import UserRole
from app.services.households import create_superadmin
from tests.factories import PASSWORD, HouseholdData, create_household, create_user, login

CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36"


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db, name="Familia Gonzalez")


@pytest.fixture
def superadmin(db: Session) -> User:
    return create_superadmin(
        db, full_name="Super", username="super", password=PASSWORD, must_change_password=False
    )


def try_login(client: TestClient, username: str, password: str, agent: str = CHROME) -> int:
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers={"User-Agent": agent},
    ).status_code


def results(db: Session) -> list[tuple[str, str]]:
    rows = db.scalars(select(LoginAttempt).order_by(LoginAttempt.id))
    return [(a.username, a.result) for a in rows]


def test_each_attempt_records_why_and_from_which_device(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    off = create_user(db, home.household, username="apagado", is_active=False)

    try_login(client, "nadie", "x")
    try_login(client, home.admin.username, "incorrecta")
    try_login(client, off.username, PASSWORD)
    try_login(client, home.admin.username, PASSWORD)

    assert results(db) == [
        ("nadie", "unknown_user"),
        (home.admin.username, "bad_password"),
        ("apagado", "disabled"),
        (home.admin.username, "ok"),
    ]
    assert db.scalars(select(LoginAttempt.user_agent)).first() == CHROME


def test_attempts_while_blocked_are_recorded_but_do_not_extend_the_block(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    for _ in range(5):
        try_login(client, home.admin.username, "incorrecta")
    for _ in range(3):
        assert try_login(client, home.admin.username, PASSWORD) == 429

    assert [r for _, r in results(db)].count("blocked") == 3
    # Pasada la ventana de los 5 fallos, entra: los intentos "bloqueados" no la estiran.
    for attempt in db.scalars(select(LoginAttempt)):
        attempt.created_at = datetime.now(UTC) - timedelta(minutes=16)
    db.flush()
    assert try_login(client, home.admin.username, PASSWORD) == 200


def test_superadmin_sees_the_panel(
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
    superadmin: User,
) -> None:
    visitor = client_factory()
    try_login(visitor, "admin", "123456")  # alguien probando un usuario que no existe
    for _ in range(5):
        try_login(visitor, home.admin.username, "incorrecta")

    panel = login(client_factory(), superadmin).get("/api/security").json()

    assert panel["summary"]["unknown_user"] == 1
    assert panel["summary"]["failed"] == 6
    assert panel["summary"]["ok"] == 1  # el ingreso del propio superadmin
    assert panel["unknown_usernames"] == ["admin"]
    assert panel["suspicious_users"] == [{"username": home.admin.username, "failures": 5}]
    assert [(lock["kind"], lock["value"]) for lock in panel["locks"]] == [
        ("username", home.admin.username)
    ]
    first = panel["attempts"][-1]
    assert first["username"] == "admin" and first["household"] is None
    by_user = {a["username"]: a for a in panel["attempts"]}
    assert by_user[home.admin.username]["household"] == "Familia Gonzalez"
    assert by_user["super"]["household"] == "Superadmin"
    # La IP con la que la app ve a quien mira el panel (en las pruebas, "testclient").
    assert panel["your_ip"] == "testclient"


def test_the_panel_has_no_financial_data(
    client_factory: Callable[[], TestClient], superadmin: User
) -> None:
    panel = login(client_factory(), superadmin).get("/api/security").json()

    assert set(panel) == {
        "summary",
        "locks",
        "suspicious_users",
        "unknown_usernames",
        "new_ip_logins",
        "attempts",
        "your_ip",
    }
    assert set(panel["attempts"][0]) == {
        "id",
        "created_at",
        "username",
        "household",
        "result",
        "ip_address",
        "user_agent",
        "new_ip",
    }


def test_login_from_a_new_ip_is_flagged(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData, superadmin: User
) -> None:
    earlier = datetime.now(UTC) - timedelta(days=2)
    db.add_all(
        [
            LoginAttempt(
                username=home.admin.username,
                ip_address="181.1.1.1",
                succeeded=True,
                result="ok",
                created_at=earlier,
            ),
            LoginAttempt(
                username=home.admin.username,
                ip_address="181.1.1.1",
                succeeded=True,
                result="ok",
                created_at=earlier + timedelta(hours=1),
            ),
            LoginAttempt(
                username=home.admin.username,
                ip_address="45.9.9.9",
                succeeded=True,
                result="ok",
                created_at=earlier + timedelta(hours=2),
            ),
        ]
    )
    db.flush()

    panel = login(client_factory(), superadmin).get("/api/security").json()

    flags = [
        (a["ip_address"], a["new_ip"])
        for a in panel["attempts"]
        if a["username"] == home.admin.username
    ]
    assert flags == [("45.9.9.9", True), ("181.1.1.1", False), ("181.1.1.1", False)]
    assert panel["new_ip_logins"] == 1


def test_superadmin_unlocks_an_account(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData, superadmin: User
) -> None:
    visitor = client_factory()
    for _ in range(5):
        try_login(visitor, home.admin.username, "incorrecta")
    assert try_login(visitor, home.admin.username, PASSWORD) == 429

    admin = login(client_factory(), superadmin)
    response = admin.post("/api/security/unlock", json={"username": home.admin.username})

    assert response.status_code == 200
    assert response.json() == {"released": 5}
    assert try_login(client_factory(), home.admin.username, PASSWORD) == 200
    assert admin.get("/api/security").json()["locks"] == []
    # Los intentos siguen en el historial, y el desbloqueo queda registrado.
    assert db.query(LoginAttempt).filter(LoginAttempt.cleared_at.is_not(None)).count() == 5
    action = db.scalar(select(AuditLog).where(AuditLog.action == "security.unlocked"))
    assert action.details == {"username": home.admin.username, "ip_address": None, "attempts": 5}


def test_unlock_needs_a_username_or_an_ip(
    client_factory: Callable[[], TestClient], superadmin: User
) -> None:
    admin = login(client_factory(), superadmin)

    assert admin.post("/api/security/unlock", json={}).status_code == 422


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MEMBER])
def test_household_users_cannot_see_the_panel(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData, role: UserRole
) -> None:
    client = login(client_factory(), create_user(db, home.household, role=role))

    assert client.get("/api/security").status_code == 403
    assert client.post("/api/security/unlock", json={"username": "x"}).status_code == 403


def test_very_old_attempts_are_deleted(
    client: TestClient, db: Session, home: HouseholdData
) -> None:
    db.add(
        LoginAttempt(
            username="viejo",
            ip_address="1.1.1.1",
            succeeded=False,
            result="bad_password",
            created_at=datetime.now(UTC) - timedelta(days=200),
        )
    )
    db.flush()

    try_login(client, home.admin.username, PASSWORD)

    assert "viejo" not in [u for u, _ in results(db)]
