"""Superadmin y administración de hogares."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, Household, User
from app.models.enums import UserRole
from app.services.households import create_superadmin
from tests.factories import PASSWORD, HouseholdData, create_household, create_user, login


@pytest.fixture
def superadmin(db: Session) -> User:
    return create_superadmin(
        db, full_name="Super", username="super", password=PASSWORD, must_change_password=False
    )


@pytest.fixture
def super_client(client_factory: Callable[[], TestClient], superadmin: User) -> TestClient:
    return login(client_factory(), superadmin)


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


NEW_HOUSEHOLD = {
    "name": "Familia de Jose",
    "admin_full_name": "Jose Gonzalez",
    "admin_username": "jose",
    "admin_password": "provisoria",
}


# --- El superadmin no accede a datos de ningún hogar ---------------------------------------


def test_superadmin_belongs_to_no_household(super_client: TestClient) -> None:
    me = super_client.get("/api/auth/me").json()

    assert me["user"]["role"] == "superadmin"
    assert me["household"] is None


@pytest.mark.parametrize(
    "path",
    [
        "/api/transactions",
        "/api/categories",
        "/api/services",
        "/api/service-periods/alerts",
        "/api/users",
        "/api/members",
        "/api/audit-logs",
    ],
)
def test_superadmin_cannot_see_household_data(
    super_client: TestClient, home: HouseholdData, path: str
) -> None:
    response = super_client.get(path)

    assert response.status_code == 403
    assert "no tiene acceso a los datos" in response.json()["detail"]


def test_household_summary_has_no_financial_data(
    super_client: TestClient, home: HouseholdData
) -> None:
    households = super_client.get("/api/households").json()

    assert set(households[0]) == {
        "id",
        "name",
        "is_active",
        "created_at",
        "users_count",
        "admins_count",
    }


def test_overview_shows_each_household_with_its_accounts(
    super_client: TestClient, db: Session, home: HouseholdData
) -> None:
    create_user(db, home.household, username="zoe")
    other = create_household(db, name="Otra familia")

    overview = super_client.get("/api/households/overview").json()

    by_name = {h["name"]: h for h in overview}
    assert set(by_name) == {"Hogar de prueba", "Otra familia"}
    members = by_name["Hogar de prueba"]["members"]
    assert members[0]["role"] == "admin"  # los administradores primero
    assert "zoe" in [m["username"] for m in members]
    assert len(members) == by_name["Hogar de prueba"]["users_count"]
    assert [m["username"] for m in by_name["Otra familia"]["members"]] == [other.admin.username]


def test_overview_has_no_financial_data(super_client: TestClient, home: HouseholdData) -> None:
    household = super_client.get("/api/households/overview").json()[0]

    assert set(household) == {
        "id",
        "name",
        "is_active",
        "created_at",
        "users_count",
        "admins_count",
        "members",
    }
    assert set(household["members"][0]) == {
        "id",
        "username",
        "full_name",
        "role",
        "is_active",
        "must_change_password",
        "last_login_at",
        "created_at",
    }
    assert "password_hash" not in str(household)


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MEMBER])
def test_household_users_cannot_see_the_overview(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData, role: UserRole
) -> None:
    client = login(client_factory(), create_user(db, home.household, role=role))

    assert client.get("/api/households/overview").status_code == 403


# --- Crear y administrar hogares -----------------------------------------------------------


def test_superadmin_creates_a_household_with_its_admin_and_categories(
    super_client: TestClient, client_factory: Callable[[], TestClient], db: Session
) -> None:
    response = super_client.post("/api/households", json=NEW_HOUSEHOLD)

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Familia de Jose"
    assert created["users_count"] == 1 and created["admins_count"] == 1
    jose = db.scalars(select(User).where(User.username == "jose")).one()
    assert jose.role == UserRole.ADMIN
    assert jose.must_change_password is True  # contraseña provisoria
    categories = {
        c.name
        for c in db.scalars(select(Category).where(Category.household_id == jose.household_id))
    }
    assert categories == {"Tarjeta de crédito", "Servicio", "Auto"}


def test_households_are_isolated(
    super_client: TestClient,
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
) -> None:
    super_client.post("/api/households", json=NEW_HOUSEHOLD)
    jose = db.scalars(select(User).where(User.username == "jose")).one()
    jose.must_change_password = False
    db.flush()
    jose_client = login(client_factory(), jose, password="provisoria")

    # Jose (administrador de su hogar) no ve los usuarios ni las categorías del otro hogar.
    usernames = {u["username"] for u in jose_client.get("/api/users").json()}
    category_ids = {c["id"] for c in jose_client.get("/api/categories").json()}

    assert usernames == {"jose"}
    assert str(home.card.id) not in category_ids


def test_duplicate_household_name(super_client: TestClient, home: HouseholdData) -> None:
    response = super_client.post(
        "/api/households", json={**NEW_HOUSEHOLD, "name": home.household.name.upper()}
    )

    assert response.status_code == 409


def test_superadmin_manages_users_of_a_household(
    super_client: TestClient, db: Session, home: HouseholdData
) -> None:
    member = create_user(db, home.household)
    base = f"/api/households/{home.household.id}/users"

    listed = super_client.get(base).json()
    detail = super_client.get(f"/api/households/{home.household.id}").json()
    one = super_client.get(f"{base}/{member.id}").json()
    promoted = super_client.patch(f"{base}/{member.id}", json={"role": "admin"})
    added = super_client.post(
        base,
        json={"username": "nuevo", "full_name": "Nuevo", "password": "provisoria", "role": "admin"},
    )
    reset = super_client.post(
        f"{base}/{member.id}/reset-password", json={"new_password": "otra-123"}
    )

    assert {u["id"] for u in listed} == {str(home.admin.id), str(member.id)}
    assert detail["users_count"] == 2
    assert one["username"] == member.username
    assert promoted.json()["role"] == "admin"
    assert added.status_code == 201
    assert reset.status_code == 204
    db.refresh(member)
    assert member.must_change_password is True


def test_superadmin_cannot_touch_users_through_another_household_id(
    super_client: TestClient, db: Session, home: HouseholdData
) -> None:
    other = create_household(db, name="Otro hogar")

    url = f"/api/households/{other.household.id}/users/{home.admin.id}"

    assert super_client.get(url).status_code == 404
    assert super_client.patch(url, json={"role": "member"}).status_code == 404


def test_deactivating_a_household_blocks_its_users_immediately(
    super_client: TestClient, client_factory: Callable[[], TestClient], home: HouseholdData
) -> None:
    admin_client = login(client_factory(), home.admin)

    super_client.patch(f"/api/households/{home.household.id}", json={"is_active": False})

    assert admin_client.get("/api/auth/me").status_code == 401  # sesión cortada
    blocked = client_factory().post(
        "/api/auth/login", json={"username": home.admin.username, "password": PASSWORD}
    )
    assert blocked.status_code == 401

    super_client.patch(f"/api/households/{home.household.id}", json={"is_active": True})
    login(client_factory(), home.admin)  # vuelve a poder ingresar


# --- Permisos ------------------------------------------------------------------------------


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MEMBER])
def test_household_users_cannot_manage_households(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData, role: UserRole
) -> None:
    client = login(client_factory(), create_user(db, home.household, role=role))

    assert client.get("/api/households").status_code == 403
    assert client.post("/api/households", json=NEW_HOUSEHOLD).status_code == 403


def test_household_admin_cannot_create_a_superadmin(
    client_factory: Callable[[], TestClient], home: HouseholdData
) -> None:
    admin_client = login(client_factory(), home.admin)

    response = admin_client.post(
        "/api/users",
        json={
            "username": "intruso",
            "full_name": "X",
            "password": "provisoria",
            "role": "superadmin",
        },
    )

    assert response.status_code == 422


def test_database_requires_superadmin_without_household(db: Session, home: HouseholdData) -> None:
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            User(
                household_id=home.household.id,
                username="x",
                full_name="X",
                password_hash="h",
                role=UserRole.SUPERADMIN,
            )
        )
        db.flush()
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            User(
                household_id=None,
                username="y",
                full_name="Y",
                password_hash="h",
                role=UserRole.MEMBER,
            )
        )
        db.flush()
    assert db.scalars(select(Household)).all()
