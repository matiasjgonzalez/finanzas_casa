from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Service, ServicePayment, Transaction, User
from app.models.enums import AmountType, ServiceFrequency
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


def payload(home: HouseholdData, **overrides: object) -> dict[str, object]:
    """Pago de la tarjeta Visa (categoría con tipos)."""
    data: dict[str, object] = {
        "amount": "1234.56",
        "occurred_on": "2026-10-05",
        "category_id": str(home.card.id),
        "category_type_id": str(home.visa.id),
    }
    data.update(overrides)
    return data


def car_payload(home: HouseholdData, **overrides: object) -> dict[str, object]:
    """Seguro del Fiat Cronos (categoría con elementos y tipos)."""
    data = payload(
        home,
        category_id=str(home.car.id),
        item_id=str(home.cronos.id),
        category_type_id=str(home.insurance.id),
    )
    data.update(overrides)
    return data


def create(client: TestClient, data: dict[str, object]) -> dict:
    response = client.post("/api/transactions", json=data)
    assert response.status_code == 201, response.text
    return response.json()


# --- Alta según la estructura de la categoría ----------------------------------------------


def test_card_payment_is_saved_with_its_type_and_exact_amount(
    member_client: TestClient, db: Session, home: HouseholdData, member: User
) -> None:
    created = create(member_client, payload(home))

    assert created["amount"] == "1234.56"
    assert created["currency"] == "ARS"
    assert created["category"]["name"] == "Tarjeta de crédito"
    assert created["category_type"]["name"] == "Visa"
    assert created["item"] is None
    assert created["description"] is None  # opcional
    assert created["created_by"] == {"id": str(member.id), "full_name": member.full_name}
    assert created["can_edit"] is True
    assert db.get(Transaction, created["id"]).amount == Decimal("1234.56")


def test_car_payment_has_car_and_type(member_client: TestClient, home: HouseholdData) -> None:
    created = create(member_client, car_payload(home, description="Cuota octubre"))

    assert created["item"]["name"] == "Fiat Cronos"
    assert created["category_type"]["name"] == "Seguro"
    assert created["description"] == "Cuota octubre"


def test_simple_category_needs_no_type(member_client: TestClient, home: HouseholdData) -> None:
    created = create(
        member_client,
        payload(home, category_id=str(home.supermarket.id), category_type_id=None),
    )

    assert created["category_type"] is None


@pytest.mark.parametrize(
    "build, message",
    [
        (lambda h: payload(h, category_type_id=None), "Elegí un tipo."),
        (lambda h: car_payload(h, item_id=None), "Elegí qué auto."),
        (lambda h: car_payload(h, category_type_id=None), "Elegí un tipo."),
        (
            lambda h: payload(h, category_type_id=str(h.insurance.id)),
            "no pertenece a «Tarjeta de crédito»",
        ),
        (lambda h: car_payload(h, item_id=str(h.visa.id)), "no pertenece a «Auto»"),
        (lambda h: payload(h, item_id=str(h.cronos.id)), "no usa elementos"),
        (
            lambda h: payload(h, category_id=str(h.supermarket.id)),
            "«Supermercado» no usa tipos",
        ),
        (
            lambda h: payload(h, occurred_on=(date.today() + timedelta(days=400)).isoformat()),
            "un año en el futuro",
        ),
        (lambda h: payload(h, occurred_on="1999-12-31"), "demasiado antigua"),
    ],
)
def test_business_rules_are_validated_with_clear_messages(
    member_client: TestClient, home: HouseholdData, build: Callable, message: str
) -> None:
    response = member_client.post("/api/transactions", json=build(home))

    assert response.status_code == 422
    assert message in response.json()["detail"]


@pytest.mark.parametrize("amount", ["0", "-5", "12.345", "abc", "10000000000000"])
def test_invalid_amounts_are_rejected(
    member_client: TestClient, home: HouseholdData, amount: str
) -> None:
    response = member_client.post("/api/transactions", json=payload(home, amount=amount))

    assert response.status_code == 422


def test_category_of_another_household_is_rejected(
    member_client: TestClient, db: Session, home: HouseholdData
) -> None:
    other = create_household(db, name="Otro hogar")

    response = member_client.post(
        "/api/transactions",
        json=payload(home, category_id=str(other.card.id), category_type_id=str(other.visa.id)),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "La categoría elegida no existe."


def test_inactive_type_is_rejected_for_new_payments_but_kept_on_old_ones(
    member_client: TestClient, db: Session, home: HouseholdData
) -> None:
    created = create(member_client, payload(home))
    home.visa.is_active = False
    db.flush()

    new = member_client.post("/api/transactions", json=payload(home))
    edit = member_client.put(
        f"/api/transactions/{created['id']}", json=payload(home, amount="10.00")
    )

    assert new.status_code == 422
    assert new.json()["detail"] == "El tipo «Visa» está desactivado."
    assert edit.status_code == 200


# --- Permisos ------------------------------------------------------------------------------


def test_member_cannot_edit_or_delete_someone_elses_payment(
    admin_client: TestClient, member_client: TestClient, home: HouseholdData
) -> None:
    by_admin = create(admin_client, payload(home))

    seen = member_client.get(f"/api/transactions/{by_admin['id']}")
    edit = member_client.put(f"/api/transactions/{by_admin['id']}", json=payload(home))
    delete = member_client.delete(f"/api/transactions/{by_admin['id']}")

    assert seen.status_code == 200  # la información del hogar es compartida…
    assert seen.json()["can_edit"] is False
    assert edit.status_code == 403  # …pero no se puede modificar lo ajeno
    assert delete.status_code == 403


def test_admin_can_edit_and_delete_any_payment(
    admin_client: TestClient, member_client: TestClient, home: HouseholdData
) -> None:
    by_member = create(member_client, payload(home))

    edit = admin_client.put(
        f"/api/transactions/{by_member['id']}", json=car_payload(home, amount="99.90")
    )

    assert edit.status_code == 200
    assert edit.json()["amount"] == "99.90"
    assert edit.json()["item"]["name"] == "Fiat Cronos"
    assert admin_client.delete(f"/api/transactions/{by_member['id']}").status_code == 204


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_payments_of_another_household_are_not_accessible(
    client_factory: Callable[[], TestClient],
    member_client: TestClient,
    db: Session,
    home: HouseholdData,
    method: str,
) -> None:
    created = create(member_client, payload(home))
    intruder = create_household(db, name="Hogar ajeno")
    intruder_client = login(client_factory(), intruder.admin)

    response = intruder_client.request(
        method, f"/api/transactions/{created['id']}", json=payload(intruder)
    )

    assert response.status_code == 404
    assert db.get(Transaction, created["id"]) is not None


def test_listing_only_shows_own_household(
    member_client: TestClient,
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
) -> None:
    create(member_client, payload(home, description="Nuestro"))
    other = create_household(db, name="Otro")
    create(login(client_factory(), other.admin), payload(other, description="Ajeno"))

    items = member_client.get("/api/transactions").json()["items"]

    assert [t["description"] for t in items] == ["Nuestro"]


# --- Eliminación ---------------------------------------------------------------------------


def test_deleting_a_payment_is_recorded_in_the_audit_log(
    member_client: TestClient, db: Session, home: HouseholdData
) -> None:
    created = create(member_client, payload(home))

    assert member_client.delete(f"/api/transactions/{created['id']}").status_code == 204

    assert db.get(Transaction, created["id"]) is None
    log = db.scalars(select(AuditLog).where(AuditLog.action == "transaction.deleted")).one()
    assert log.details["amount"] == "1234.56"


def test_payment_of_a_service_period_cannot_be_deleted_directly(
    member_client: TestClient, db: Session, home: HouseholdData
) -> None:
    created = create(member_client, payload(home))
    service = Service(
        household_id=home.household.id,
        name="Luz",
        category_id=home.card.id,
        amount_type=AmountType.FIXED,
        estimated_amount=Decimal("1234.56"),
        frequency=ServiceFrequency.MONTHLY,
        first_due_date=date(2026, 10, 5),
        created_by_id=home.admin.id,
    )
    db.add(service)
    db.flush()
    db.add(
        ServicePayment(
            household_id=home.household.id,
            service_id=service.id,
            due_date=date(2026, 10, 5),
            status="paid",
            paid_on=date(2026, 10, 5),
            amount_paid=Decimal("1234.56"),
            transaction_id=created["id"],
        )
    )
    db.flush()

    response = member_client.delete(f"/api/transactions/{created['id']}")

    assert response.status_code == 409
    assert "vencimiento de servicio" in response.json()["detail"]


# --- Listado: filtros, orden, paginación y total -------------------------------------------


@pytest.fixture
def sample(home: HouseholdData, member_client: TestClient, admin_client: TestClient) -> None:
    create(
        member_client,
        payload(
            home,
            amount="100.00",
            occurred_on="2026-09-10",
            category_id=str(home.supermarket.id),
            category_type_id=None,
            description="Súper",
        ),
    )
    create(
        member_client,
        payload(
            home,
            amount="50.00",
            occurred_on="2026-10-01",
            category_type_id=str(home.mastercard.id),
            description="Resumen",
        ),
    )
    create(
        admin_client,
        car_payload(home, amount="900.00", occurred_on="2026-10-02", description="Seguro anual"),
    )
    create(
        admin_client,
        car_payload(
            home,
            amount="300.00",
            occurred_on="2026-10-03",
            item_id=str(home.ka.id),
            category_type_id=str(home.plate_tax.id),
            description="Patente 100% paga",
        ),
    )


def descriptions(client: TestClient, query: str = "") -> list[str]:
    return [t["description"] for t in client.get(f"/api/transactions{query}").json()["items"]]


def test_default_order_is_most_recent_first(member_client: TestClient, sample: None) -> None:
    assert descriptions(member_client) == ["Patente 100% paga", "Seguro anual", "Resumen", "Súper"]


def test_filters(
    member_client: TestClient, member: User, home: HouseholdData, sample: None
) -> None:
    assert descriptions(member_client, f"?category_id={home.car.id}") == [
        "Patente 100% paga",
        "Seguro anual",
    ]
    assert descriptions(member_client, f"?item_id={home.cronos.id}") == ["Seguro anual"]
    assert descriptions(member_client, f"?category_type_id={home.mastercard.id}") == ["Resumen"]
    assert descriptions(member_client, f"?created_by_id={member.id}") == ["Resumen", "Súper"]
    assert descriptions(member_client, "?date_from=2026-10-01&date_to=2026-10-02") == [
        "Seguro anual",
        "Resumen",
    ]
    assert descriptions(member_client, "?amount_min=100&amount_max=900") == [
        "Patente 100% paga",
        "Seguro anual",
        "Súper",
    ]


def test_search_ignores_accents_and_looks_at_category_type_and_item_names(
    member_client: TestClient, sample: None
) -> None:
    assert descriptions(member_client, "?q=SUPER") == ["Súper"]  # sin distinguir tildes
    assert descriptions(member_client, "?q=cronos") == ["Seguro anual"]  # nombre del auto
    assert descriptions(member_client, "?q=mastercard") == ["Resumen"]  # nombre del tipo


def test_search_treats_percent_as_text(member_client: TestClient, sample: None) -> None:
    assert descriptions(member_client, "?q=%25") == ["Patente 100% paga"]


def test_sort_by_amount(member_client: TestClient, sample: None) -> None:
    amounts = [
        t["amount"]
        for t in member_client.get("/api/transactions?sort=amount&order=asc").json()["items"]
    ]
    assert amounts == ["50.00", "100.00", "300.00", "900.00"]


def test_pagination(member_client: TestClient, sample: None) -> None:
    page2 = member_client.get("/api/transactions?page=2&page_size=3").json()

    assert page2["total"] == 4
    assert [t["description"] for t in page2["items"]] == ["Súper"]


def test_total_follows_the_filters(
    member_client: TestClient, home: HouseholdData, sample: None
) -> None:
    all_payments = member_client.get("/api/transactions").json()
    car_only = member_client.get(f"/api/transactions?category_id={home.car.id}").json()

    assert all_payments["total_amount"] == "1350.00"
    assert car_only["total_amount"] == "1200.00"
