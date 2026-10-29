"""Servicios recurrentes, generación de vencimientos y registro de sus pagos."""

from collections.abc import Callable
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Category, CategoryType, ServicePayment, Transaction, User
from app.models.enums import CategoryStructure
from app.services import recurring
from tests.factories import HouseholdData, create_household, create_user, login

TODAY = date(2026, 10, 15)
PDF = b"%PDF-1.7\n%%EOF\n"


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    """Las pruebas no dependen de la fecha real: "hoy" es el 15/10/2026."""
    monkeypatch.setattr(recurring, "_today", lambda: TODAY)


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def utilities(db: Session, home: HouseholdData) -> tuple[Category, CategoryType]:
    category = Category(
        household_id=home.household.id,
        name="Servicio",
        structure=CategoryStructure.TYPES,
    )
    db.add(category)
    db.flush()
    light = CategoryType(household_id=home.household.id, category_id=category.id, name="Luz")
    db.add(light)
    db.flush()
    return category, light


@pytest.fixture
def member(db: Session, home: HouseholdData) -> User:
    return create_user(db, home.household)


@pytest.fixture
def admin_client(client_factory: Callable[[], TestClient], home: HouseholdData) -> TestClient:
    return login(client_factory(), home.admin)


@pytest.fixture
def member_client(client_factory: Callable[[], TestClient], member: User) -> TestClient:
    return login(client_factory(), member)


def service_payload(utilities: tuple[Category, CategoryType], **overrides: object) -> dict:
    category, light = utilities
    data: dict[str, object] = {
        "name": "Luz Edesur",
        "provider": "Edesur",
        "category_id": str(category.id),
        "category_type_id": str(light.id),
        "amount_type": "fixed",
        "estimated_amount": "45000.00",
        "frequency": "monthly",
        "first_due_date": "2026-10-10",
    }
    data.update(overrides)
    return data


@pytest.fixture
def service(admin_client: TestClient, utilities: tuple[Category, CategoryType]) -> dict:
    response = admin_client.post("/api/services", json=service_payload(utilities))
    assert response.status_code == 201, response.text
    return response.json()


def periods(
    client: TestClient, date_from: str = "2026-10-01", date_to: str = "2026-12-31"
) -> list[dict]:
    response = client.get(f"/api/service-periods?date_from={date_from}&date_to={date_to}")
    assert response.status_code == 200, response.text
    return response.json()


def period_on(client: TestClient, due: str) -> dict:
    return next(p for p in periods(client) if p["due_date"] == due)


# --- Alta de servicios ---------------------------------------------------------------------


def test_admin_creates_a_service_and_its_next_due_date_is_shown(service: dict) -> None:
    assert service["category"]["name"] == "Servicio"
    assert service["category_type"]["name"] == "Luz"
    assert service["next_period"]["due_date"] == "2026-10-10"
    assert service["next_period"]["status"] == "overdue"  # 10/10 ya pasó (hoy es 15/10)


def test_members_see_services_but_cannot_manage_them(
    member_client: TestClient, utilities: tuple, service: dict
) -> None:
    assert [s["name"] for s in member_client.get("/api/services").json()] == ["Luz Edesur"]
    assert member_client.post("/api/services", json=service_payload(utilities)).status_code == 403
    assert (
        member_client.put(
            f"/api/services/{service['id']}", json=service_payload(utilities)
        ).status_code
        == 403
    )


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"estimated_amount": None}, "importe fijo necesita el importe"),
        ({"category_type_id": None}, "Elegí un tipo."),
    ],
)
def test_service_validation(
    admin_client: TestClient, utilities: tuple, overrides: dict, message: str
) -> None:
    response = admin_client.post("/api/services", json=service_payload(utilities, **overrides))

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_any_category_type_can_have_a_due_date(
    admin_client: TestClient, home: HouseholdData, utilities: tuple
) -> None:
    """El resumen de la tarjeta o la patente de un auto también vencen."""
    card = admin_client.post(
        "/api/services",
        json=service_payload(
            utilities,
            name="Visa",
            category_id=str(home.card.id),
            category_type_id=str(home.visa.id),
        ),
    )
    plate = admin_client.post(
        "/api/services",
        json=service_payload(
            utilities,
            name="Patente · Fiat Cronos",
            category_id=str(home.car.id),
            category_type_id=str(home.plate_tax.id),
            item_id=str(home.cronos.id),
        ),
    )

    assert card.status_code == 201
    assert plate.status_code == 201


def test_one_due_date_schedule_per_type_and_item(
    admin_client: TestClient, home: HouseholdData, utilities: tuple
) -> None:
    def car(item: str) -> dict:
        return service_payload(
            utilities,
            category_id=str(home.car.id),
            category_type_id=str(home.plate_tax.id),
            item_id=item,
        )

    first = admin_client.post("/api/services", json=service_payload(utilities))
    again = admin_client.post("/api/services", json=service_payload(utilities))
    cronos = admin_client.post("/api/services", json=car(str(home.cronos.id)))
    ka = admin_client.post("/api/services", json=car(str(home.ka.id)))  # otro auto: se permite

    assert first.status_code == 201
    assert again.status_code == 409
    assert "ya tiene un vencimiento" in again.json()["detail"]
    assert cronos.status_code == 201 and ka.status_code == 201


# --- Generación de vencimientos ------------------------------------------------------------


def test_periods_are_generated_by_frequency_without_duplicates(
    member_client: TestClient, db: Session, service: dict
) -> None:
    first = periods(member_client)
    second = periods(member_client)  # consultar de nuevo no duplica

    assert [p["due_date"] for p in first] == ["2026-10-10", "2026-11-10", "2026-12-10"]
    assert [p["amount_due"] for p in first] == ["45000.00"] * 3
    assert [p["id"] for p in second] == [p["id"] for p in first]
    count = db.scalar(select(func.count()).select_from(ServicePayment))
    assert count == 3  # el horizonte por defecto (hoy + 60 días) no pasa del 31/12


def test_status_pending_overdue_and_alerts(member_client: TestClient, service: dict) -> None:
    statuses = {p["due_date"]: p["status"] for p in periods(member_client)}
    alerts = member_client.get("/api/service-periods/alerts?days=30").json()

    assert statuses == {"2026-10-10": "overdue", "2026-11-10": "pending", "2026-12-10": "pending"}
    # Vencido + el de noviembre (dentro de 30 días). Nunca se marca pagado por haber vencido.
    assert alerts["overdue"] == 1
    assert alerts["due_soon"] == 1


def test_variable_service_without_amount(admin_client: TestClient, utilities: tuple) -> None:
    admin_client.post(
        "/api/services",
        json=service_payload(utilities, amount_type="variable", estimated_amount=None),
    )

    assert {p["amount_due"] for p in periods(admin_client)} == {None}


# --- Pago de un vencimiento ----------------------------------------------------------------


def test_paying_creates_one_expense_linked_to_the_period(
    member_client: TestClient, db: Session, service: dict, member: User
) -> None:
    period = period_on(member_client, "2026-10-10")

    response = member_client.post(
        f"/api/service-periods/{period['id']}/pay", json={"paid_on": "2026-10-12"}
    )

    paid = response.json()
    assert response.status_code == 200
    assert paid["status"] == "paid"
    assert paid["amount_paid"] == "45000.00"
    assert paid["paid_on"] == "2026-10-12"
    assert paid["paid_by"]["id"] == str(member.id)
    payment = db.get(Transaction, paid["transaction_id"])
    assert payment.amount == Decimal("45000.00")
    assert payment.occurred_on == date(2026, 10, 12)
    listed = member_client.get("/api/transactions?date_from=2026-10-01").json()["items"]
    assert listed[0]["service_period_id"] == period["id"]
    assert listed[0]["category_type"]["name"] == "Luz"


def test_paying_another_amount_updates_the_period_amount(
    member_client: TestClient, service: dict
) -> None:
    """Hay un solo importe: si se pagó otro (ej. llegó con aumento), el vencimiento lo refleja."""
    period = period_on(member_client, "2026-10-10")

    paid = member_client.post(
        f"/api/service-periods/{period['id']}/pay", json={"amount": "47250.00"}
    ).json()

    assert paid["amount_paid"] == "47250.00"
    assert paid["amount_due"] == "47250.00"


def test_a_period_cannot_be_paid_twice(
    member_client: TestClient, db: Session, service: dict
) -> None:
    period = period_on(member_client, "2026-10-10")
    member_client.post(f"/api/service-periods/{period['id']}/pay", json={})

    again = member_client.post(f"/api/service-periods/{period['id']}/pay", json={})

    assert again.status_code == 409
    assert db.scalar(select(func.count()).select_from(Transaction)) == 1  # sin gasto duplicado


def test_paying_a_variable_period_requires_the_amount(
    admin_client: TestClient, utilities: tuple
) -> None:
    admin_client.post(
        "/api/services",
        json=service_payload(utilities, amount_type="variable", estimated_amount=None),
    )
    period = period_on(admin_client, "2026-10-10")

    without = admin_client.post(f"/api/service-periods/{period['id']}/pay", json={})
    with_amount = admin_client.post(
        f"/api/service-periods/{period['id']}/pay", json={"amount": "38750.40"}
    )

    assert without.status_code == 422
    assert without.json()["detail"] == "Ingresá el importe pagado."
    assert with_amount.json()["amount_paid"] == "38750.40"


def test_linking_an_existing_payment_avoids_duplicating_the_expense(
    member_client: TestClient, db: Session, service: dict, utilities: tuple
) -> None:
    category, light = utilities
    existing = member_client.post(
        "/api/transactions",
        json={
            "amount": "44100.00",
            "occurred_on": "2026-10-09",
            "category_id": str(category.id),
            "category_type_id": str(light.id),
        },
    ).json()
    period = period_on(member_client, "2026-10-10")

    candidates = member_client.get(f"/api/service-periods/{period['id']}/candidates").json()
    linked = member_client.post(
        f"/api/service-periods/{period['id']}/pay",
        json={"mode": "link", "transaction_id": existing["id"]},
    ).json()

    assert [c["id"] for c in candidates] == [existing["id"]]
    assert linked["transaction_id"] == existing["id"]
    assert linked["amount_paid"] == "44100.00"
    assert db.scalar(select(func.count()).select_from(Transaction)) == 1
    # Ya vinculado: deja de ser candidato para otro vencimiento.
    november = period_on(member_client, "2026-11-10")
    assert member_client.get(f"/api/service-periods/{november['id']}/candidates").json() == []
    again = member_client.post(
        f"/api/service-periods/{november['id']}/pay",
        json={"mode": "link", "transaction_id": existing["id"]},
    )
    assert again.status_code == 409


def test_cannot_link_a_payment_of_another_category(
    member_client: TestClient, home: HouseholdData, service: dict
) -> None:
    other = member_client.post(
        "/api/transactions",
        json={"amount": "10", "occurred_on": "2026-10-09", "category_id": str(home.supermarket.id)},
    ).json()
    period = period_on(member_client, "2026-10-10")

    response = member_client.post(
        f"/api/service-periods/{period['id']}/pay",
        json={"mode": "link", "transaction_id": other["id"]},
    )

    assert response.status_code == 422


# --- Anular un pago ------------------------------------------------------------------------


def test_unpay_deletes_the_payment_by_default(
    member_client: TestClient, db: Session, service: dict
) -> None:
    period = period_on(member_client, "2026-10-10")
    member_client.post(f"/api/service-periods/{period['id']}/pay", json={})

    response = member_client.post(f"/api/service-periods/{period['id']}/unpay", json={})

    assert response.json()["status"] == "overdue"
    assert db.scalar(select(func.count()).select_from(Transaction)) == 0


def test_unpay_can_keep_the_payment(member_client: TestClient, db: Session, service: dict) -> None:
    period = period_on(member_client, "2026-10-10")
    paid = member_client.post(f"/api/service-periods/{period['id']}/pay", json={}).json()

    member_client.post(f"/api/service-periods/{period['id']}/unpay", json={"delete_payment": False})

    kept = db.get(Transaction, paid["transaction_id"])
    assert kept is not None
    # Desvinculado, ahora sí se puede eliminar desde Pagos.
    assert member_client.delete(f"/api/transactions/{kept.id}").status_code == 204


def test_only_who_paid_or_an_admin_can_unpay(
    member_client: TestClient,
    admin_client: TestClient,
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
    service: dict,
) -> None:
    period = period_on(member_client, "2026-10-10")
    member_client.post(f"/api/service-periods/{period['id']}/pay", json={})
    sibling = login(client_factory(), create_user(db, home.household))

    assert sibling.post(f"/api/service-periods/{period['id']}/unpay", json={}).status_code == 403
    assert (
        admin_client.post(f"/api/service-periods/{period['id']}/unpay", json={}).status_code == 200
    )


# --- Importes: cada período conserva el suyo -----------------------------------------------


def test_correcting_a_period_amount_does_not_change_the_service(
    member_client: TestClient, db: Session, service: dict
) -> None:
    period = period_on(member_client, "2026-11-10")

    response = member_client.patch(
        f"/api/service-periods/{period['id']}", json={"amount_due": "51234.00"}
    )

    assert response.json()["amount_due"] == "51234.00"
    assert (
        member_client.get(f"/api/services/{service['id']}").json()["estimated_amount"] == "45000.00"
    )
    assert db.scalars(select(AuditLog.action)).all()[-1] == "service_period.amount_corrected"


def test_new_service_amount_applies_only_to_future_untouched_periods(
    admin_client: TestClient, utilities: tuple, service: dict
) -> None:
    october = period_on(admin_client, "2026-10-10")  # pasado (vencido)
    admin_client.post(f"/api/service-periods/{october['id']}/pay", json={})
    december = period_on(admin_client, "2026-12-10")
    admin_client.patch(f"/api/service-periods/{december['id']}", json={"amount_due": "47000.00"})

    admin_client.put(
        f"/api/services/{service['id']}",
        json=service_payload(utilities, estimated_amount="52000.00"),
    )

    amounts = {p["due_date"]: (p["amount_due"], p["amount_paid"]) for p in periods(admin_client)}
    assert amounts["2026-10-10"] == ("45000.00", "45000.00")  # pagado: no cambia
    assert amounts["2026-11-10"] == ("52000.00", None)  # futuro: toma el nuevo importe
    assert amounts["2026-12-10"] == ("47000.00", None)  # corregido a mano: se respeta


def test_changing_the_frequency_regenerates_future_periods(
    admin_client: TestClient, utilities: tuple, service: dict
) -> None:
    october = period_on(admin_client, "2026-10-10")
    admin_client.post(f"/api/service-periods/{october['id']}/pay", json={})

    admin_client.put(
        f"/api/services/{service['id']}", json=service_payload(utilities, frequency="bimonthly")
    )

    assert [p["due_date"] for p in periods(admin_client)] == ["2026-10-10", "2026-12-10"]


def test_deactivated_service_stops_generating_periods(
    admin_client: TestClient, utilities: tuple, service: dict
) -> None:
    admin_client.put(
        f"/api/services/{service['id']}", json=service_payload(utilities, is_active=False)
    )

    remaining = periods(admin_client, date_to="2027-06-30")

    # Solo queda el vencido (pasado, es una deuda real); los futuros se quitaron.
    assert [p["due_date"] for p in remaining] == ["2026-10-10"]
    assert admin_client.get("/api/services").json() == []


# --- Comprobantes del vencimiento ----------------------------------------------------------


def test_any_member_attaches_the_bill_to_a_period(member_client: TestClient, service: dict) -> None:
    period = period_on(member_client, "2026-11-10")

    upload = member_client.post(
        f"/api/service-periods/{period['id']}/attachments",
        files={"file": ("factura-luz.pdf", PDF, "application/pdf")},
    )
    detail = member_client.get(f"/api/service-periods/{period['id']}").json()

    assert upload.status_code == 201
    assert [a["original_filename"] for a in detail["attachments"]] == ["factura-luz.pdf"]
    assert member_client.delete(f"/api/attachments/{upload.json()['id']}").status_code == 204


# --- Aislamiento entre hogares -------------------------------------------------------------


def test_another_household_cannot_see_or_pay_our_periods(
    client_factory: Callable[[], TestClient], member_client: TestClient, db: Session, service: dict
) -> None:
    period = period_on(member_client, "2026-10-10")
    intruder = login(client_factory(), create_household(db, name="Ajeno").admin)

    assert intruder.get(f"/api/service-periods/{period['id']}").status_code == 404
    assert intruder.post(f"/api/service-periods/{period['id']}/pay", json={}).status_code == 404
    assert intruder.get(f"/api/services/{service['id']}").status_code == 404
    assert periods(intruder) == []
    assert period_on(member_client, "2026-10-10")["status"] == "overdue"
