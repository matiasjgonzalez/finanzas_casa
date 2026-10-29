from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from tests.factories import HouseholdData, create_household, create_user, login


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def member(db: Session, home: HouseholdData) -> User:
    return create_user(db, home.household)


@pytest.fixture
def admin_client(client_factory: Callable[[], TestClient], home: HouseholdData) -> TestClient:
    return login(client_factory(), home.admin)


@pytest.fixture
def member_client(client_factory: Callable[[], TestClient], member: User) -> TestClient:
    return login(client_factory(), member)


def by_name(client: TestClient, query: str = "") -> dict[str, dict]:
    return {c["name"]: c for c in client.get(f"/api/categories{query}").json()}


# --- Consulta ------------------------------------------------------------------------------


def test_categories_come_with_their_types_and_items(member_client: TestClient) -> None:
    categories = by_name(member_client)

    assert list(categories) == ["Auto", "Supermercado", "Tarjeta de crédito"]
    car = categories["Auto"]
    assert car["structure"] == "items_and_types"
    assert car["item_label"] == "Auto"
    assert [i["name"] for i in car["items"]] == ["Fiat Cronos", "Ford Ka"]
    assert [t["name"] for t in car["types"]] == ["Patente", "Seguro"]
    assert [t["name"] for t in categories["Tarjeta de crédito"]["types"]] == ["Mastercard", "Visa"]
    assert categories["Supermercado"]["types"] == []


def test_inactive_entries_are_hidden_except_for_admin(
    admin_client: TestClient, member_client: TestClient, home: HouseholdData
) -> None:
    admin_client.patch(f"/api/category-types/{home.visa.id}", json={"is_active": False})
    admin_client.patch(f"/api/categories/{home.supermarket.id}", json={"is_active": False})

    member_view = by_name(member_client)
    assert "Supermercado" not in member_view
    assert [t["name"] for t in member_view["Tarjeta de crédito"]["types"]] == ["Mastercard"]
    assert member_client.get("/api/categories?include_inactive=true").status_code == 403
    admin_view = by_name(admin_client, "?include_inactive=true")
    assert "Supermercado" in admin_view
    assert len(admin_view["Tarjeta de crédito"]["types"]) == 2


# --- Administración ------------------------------------------------------------------------


def test_admin_creates_a_category_with_items_and_types(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/api/categories", json={"name": "  Moto ", "structure": "items_and_types"}
    )
    category_id = created.json()["id"]
    item = admin_client.post(f"/api/categories/{category_id}/items", json={"name": "Honda CB"})
    kind = admin_client.post(f"/api/categories/{category_id}/types", json={"name": "Seguro"})

    assert created.status_code == 201
    assert created.json()["name"] == "Moto"
    assert created.json()["item_label"] == "Moto"  # por defecto, el nombre de la categoría
    assert item.status_code == 201
    assert kind.status_code == 201
    moto = by_name(admin_client)["Moto"]
    assert [i["name"] for i in moto["items"]] == ["Honda CB"]
    assert [t["name"] for t in moto["types"]] == ["Seguro"]


def test_types_and_items_are_only_allowed_by_the_category_structure(
    admin_client: TestClient, home: HouseholdData
) -> None:
    on_simple = admin_client.post(
        f"/api/categories/{home.supermarket.id}/types", json={"name": "Mayorista"}
    )
    item_on_types = admin_client.post(
        f"/api/categories/{home.card.id}/items", json={"name": "Algo"}
    )

    assert on_simple.status_code == 422
    assert on_simple.json()["detail"] == "Esta categoría no usa tipos."
    assert item_on_types.status_code == 422


def test_names_are_unique_ignoring_case(admin_client: TestClient, home: HouseholdData) -> None:
    category = admin_client.post("/api/categories", json={"name": "AUTO"})
    card_type = admin_client.post(f"/api/categories/{home.card.id}/types", json={"name": "visa"})
    # El mismo nombre de tipo en OTRA categoría sí se permite.
    other_category = admin_client.post(
        f"/api/categories/{home.car.id}/types", json={"name": "Visa"}
    )

    assert category.status_code == 409
    assert category.json()["detail"] == "Ya existe una categoría llamada «AUTO»."
    assert card_type.status_code == 409
    assert other_category.status_code == 201


def test_rename_and_deactivate_types_and_items(
    admin_client: TestClient, home: HouseholdData
) -> None:
    renamed = admin_client.patch(f"/api/category-items/{home.ka.id}", json={"name": "Ford Ka 2015"})
    deactivated = admin_client.patch(
        f"/api/category-types/{home.plate_tax.id}", json={"is_active": False}
    )

    assert renamed.json()["name"] == "Ford Ka 2015"
    assert deactivated.json()["is_active"] is False


def test_structure_cannot_change_once_the_category_has_payments(
    admin_client: TestClient, home: HouseholdData
) -> None:
    admin_client.post(
        "/api/transactions",
        json={"amount": "10", "occurred_on": "2026-10-01", "category_id": str(home.supermarket.id)},
    )

    response = admin_client.patch(
        f"/api/categories/{home.supermarket.id}", json={"structure": "types"}
    )

    assert response.status_code == 409


def test_structure_can_change_while_unused(admin_client: TestClient, home: HouseholdData) -> None:
    response = admin_client.patch(
        f"/api/categories/{home.supermarket.id}", json={"structure": "types"}
    )

    assert response.status_code == 200
    assert response.json()["structure"] == "types"


# --- Permisos y aislamiento ----------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("POST", "/api/categories", {"name": "X"}),
        ("PATCH", "/api/categories/{card}", {"name": "Hackeada"}),
        ("POST", "/api/categories/{card}/types", {"name": "Amex"}),
        ("PATCH", "/api/category-types/{visa}", {"is_active": False}),
        ("POST", "/api/categories/{car}/items", {"name": "Otro auto"}),
        ("PATCH", "/api/category-items/{cronos}", {"name": "X"}),
    ],
)
def test_members_cannot_modify_the_catalog(
    member_client: TestClient, home: HouseholdData, method: str, path: str, body: dict
) -> None:
    url = path.format(card=home.card.id, visa=home.visa.id, car=home.car.id, cronos=home.cronos.id)

    assert member_client.request(method, url, json=body).status_code == 403


@pytest.mark.parametrize(
    "path, body",
    [
        ("/api/categories/{card}", {"is_active": False}),
        ("/api/category-types/{visa}", {"is_active": False}),
        ("/api/category-items/{cronos}", {"is_active": False}),
    ],
)
def test_another_household_cannot_modify_our_catalog(
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
    path: str,
    body: dict,
) -> None:
    intruder = login(client_factory(), create_household(db, name="Ajeno").admin)
    url = path.format(card=home.card.id, visa=home.visa.id, cronos=home.cronos.id)

    assert intruder.patch(url, json=body).status_code == 404
    assert (
        intruder.post(f"/api/categories/{home.card.id}/types", json={"name": "Intruso"}).status_code
        == 404
    )


def test_catalog_changes_are_audited(
    admin_client: TestClient, db: Session, home: HouseholdData
) -> None:
    admin_client.post(f"/api/categories/{home.card.id}/types", json={"name": "Amex"})

    assert db.scalars(select(AuditLog.action)).all()[-1] == "category_type.created"
