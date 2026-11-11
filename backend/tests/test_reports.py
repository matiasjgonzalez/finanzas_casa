"""Informes, resumen de Inicio y presupuestos."""

from collections.abc import Callable
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.models.enums import UserRole
from tests.factories import HouseholdData, build_payment, create_household, create_user, login


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def member(db: Session, home: HouseholdData) -> User:
    return create_user(db, home.household, role=UserRole.MEMBER)


@pytest.fixture
def member_client(client_factory: Callable[[], TestClient], member: User) -> TestClient:
    return login(client_factory(), member)


@pytest.fixture
def admin_client(client_factory: Callable[[], TestClient], home: HouseholdData) -> TestClient:
    return login(client_factory(), home.admin)


@pytest.fixture
def payments(db: Session, home: HouseholdData, member: User) -> None:
    """Septiembre: 1 pago. Octubre: supermercado x2, Cronos y Ka. Otro hogar: no cuenta."""
    data = [
        ("1000.00", date(2026, 9, 20), {}),
        ("1500.50", date(2026, 10, 1), {}),
        ("2000.00", date(2026, 10, 15), {"created_by_id": member.id}),
        (
            "30000.00",
            date(2026, 10, 3),
            {
                "category_id": home.car.id,
                "item_id": home.cronos.id,
                "category_type_id": home.insurance.id,
            },
        ),
        (
            "5000.00",
            date(2026, 10, 9),
            {
                "category_id": home.car.id,
                "item_id": home.ka.id,
                "category_type_id": home.plate_tax.id,
            },
        ),
    ]
    for amount, day, extra in data:
        db.add(build_payment(home, amount, occurred_on=day, **extra))
    other = create_household(db, name="Otro hogar")
    db.add(build_payment(other, "999999.00", occurred_on=date(2026, 10, 5)))
    db.flush()


# --- Resumen e informes --------------------------------------------------------------------


def test_summary_of_the_month(member_client: TestClient, payments: None) -> None:
    data = member_client.get("/api/reports/summary?month=2026-10").json()

    assert data["total"] == "38500.50"
    assert data["count"] == 4
    assert data["previous_total"] == "1000.00"
    assert [(c["name"], c["total"]) for c in data["by_category"]] == [
        ("Auto", "35000.00"),
        ("Supermercado", "3500.50"),
    ]


def test_monthly_evolution_fills_empty_months(member_client: TestClient, payments: None) -> None:
    data = member_client.get("/api/reports/monthly?until=2026-10&months=3").json()

    assert [(m["month"], m["total"]) for m in data] == [
        ("2026-08-01", "0"),
        ("2026-09-01", "1000.00"),
        ("2026-10-01", "38500.50"),
    ]


def test_breakdown_by_car_and_by_member(
    member_client: TestClient, payments: None, home: HouseholdData, member: User
) -> None:
    query = "date_from=2026-10-01&date_to=2026-10-31"
    cars = member_client.get(
        f"/api/reports/breakdown?group=item&category_id={home.car.id}&{query}"
    ).json()
    members = member_client.get(f"/api/reports/breakdown?group=member&{query}").json()

    assert [(c["name"], c["total"]) for c in cars] == [
        ("Fiat Cronos", "30000.00"),
        ("Ford Ka", "5000.00"),
    ]
    assert {m["name"]: m["total"] for m in members} == {
        home.admin.full_name: "36500.50",
        member.full_name: "2000.00",
    }


def test_breakdown_rejects_inverted_range(member_client: TestClient) -> None:
    response = member_client.get("/api/reports/breakdown?date_from=2026-10-31&date_to=2026-10-01")

    assert response.status_code == 422


def test_export_csv_opens_in_excel(member_client: TestClient, payments: None) -> None:
    response = member_client.get("/api/reports/export.csv?date_from=2026-10-01&date_to=2026-10-31")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿Fecha de pago;Importe;Categoría")
    lines = text.strip().split("\r\n")
    assert len(lines) == 5  # encabezado + 4 pagos de octubre (no los de otro hogar)
    assert lines[1].startswith("01/10/2026;1500,50;Supermercado")
    assert "999999" not in text


# --- Presupuestos --------------------------------------------------------------------------


def budget(client: TestClient, category_id: object, month: str, amount: str | None) -> int:
    return client.put(
        f"/api/budgets/{category_id}", json={"month": month, "amount": amount}
    ).status_code


def test_budget_applies_from_its_month_until_changed(
    admin_client: TestClient, member_client: TestClient, home: HouseholdData, payments: None
) -> None:
    assert budget(admin_client, home.supermarket.id, "2026-09", "3000.00") == 204
    assert budget(admin_client, home.supermarket.id, "2026-12", "8000.00") == 204
    assert budget(admin_client, home.supermarket.id, "2027-02", None) == 204  # se quita

    def month(m: str) -> list[dict]:
        return member_client.get(f"/api/budgets?month={m}").json()

    october = month("2026-10")
    assert october == [
        {
            "category": {"id": str(home.supermarket.id), "name": "Supermercado"},
            "amount": "3000.00",
            "spent": "3500.50",
            "since": "2026-09-01",
            "status": "exceeded",
        }
    ]
    assert month("2026-08") == []  # antes de fijarlo
    assert month("2027-01")[0]["amount"] == "8000.00"
    assert month("2027-01")[0]["status"] == "ok"
    assert month("2027-03") == []  # quitado desde febrero


def test_budget_warning_from_80_percent(
    admin_client: TestClient, home: HouseholdData, payments: None
) -> None:
    budget(admin_client, home.car.id, "2026-10", "40000.00")  # gastado 35.000 = 87,5 %

    assert admin_client.get("/api/budgets?month=2026-10").json()[0]["status"] == "warning"


def test_only_admins_set_budgets(member_client: TestClient, home: HouseholdData) -> None:
    assert budget(member_client, home.supermarket.id, "2026-10", "1000.00") == 403


def test_budget_validation(admin_client: TestClient, db: Session, home: HouseholdData) -> None:
    other = create_household(db, name="Otro hogar")

    assert budget(admin_client, home.supermarket.id, "2026-13", "1000.00") == 422
    assert budget(admin_client, home.supermarket.id, "2026-10", "0") == 422
    assert budget(admin_client, other.supermarket.id, "2026-10", "1000.00") == 404
    assert admin_client.get("/api/budgets?month=octubre").status_code == 422


# --- Gráficos de la evolución, del mes y de los vencimientos -------------------------------


def test_monthly_grouped_by_category_and_by_car(
    member_client: TestClient, payments: None, home: HouseholdData
) -> None:
    by_category = member_client.get("/api/reports/monthly-grouped?until=2026-10&months=2").json()
    by_car = member_client.get(
        f"/api/reports/monthly-grouped?group=item&category_id={home.car.id}&until=2026-10&months=1"
    ).json()

    assert [(g["name"], g["total"]) for g in by_category[0]["groups"]] == [
        ("Supermercado", "1000.00")
    ]
    assert by_category[1]["total"] == "38500.50"
    assert [(g["name"], g["total"]) for g in by_category[1]["groups"]] == [
        ("Auto", "35000.00"),
        ("Supermercado", "3500.50"),
    ]
    assert [(g["name"], g["total"]) for g in by_car[0]["groups"]] == [
        ("Fiat Cronos", "30000.00"),
        ("Ford Ka", "5000.00"),
    ]


def test_monthly_of_a_single_type(
    member_client: TestClient, payments: None, home: HouseholdData
) -> None:
    data = member_client.get(
        f"/api/reports/monthly?until=2026-10&months=1&category_type_id={home.insurance.id}"
    ).json()

    assert data == [{"month": "2026-10-01", "total": "30000.00", "count": 1}]


def test_daily_and_patterns(member_client: TestClient, payments: None) -> None:
    days = member_client.get("/api/reports/daily?month=2026-10").json()
    patterns = member_client.get(
        "/api/reports/patterns?date_from=2026-10-01&date_to=2026-10-31"
    ).json()

    assert [(d["date"], d["total"]) for d in days] == [
        ("2026-10-01", "1500.50"),
        ("2026-10-03", "30000.00"),
        ("2026-10-09", "5000.00"),
        ("2026-10-15", "2000.00"),
    ]
    assert len(patterns["weekdays"]) == 7 and len(patterns["month_days"]) == 31
    # 01/10 y 15/10/2026 fueron jueves (4); 03/10, sábado (6).
    assert patterns["weekdays"][3] == {"slot": 4, "total": "3500.50", "count": 2}
    assert patterns["weekdays"][5]["total"] == "30000.00"
    assert patterns["month_days"][0]["total"] == "1500.50"


def test_budget_history(admin_client: TestClient, home: HouseholdData, payments: None) -> None:
    budget(admin_client, home.supermarket.id, "2026-10", "3000.00")

    data = admin_client.get(
        f"/api/budgets/{home.supermarket.id}/history?until=2026-11&months=3"
    ).json()

    assert data == [
        {"month": "2026-09-01", "budget": None, "spent": "1000.00"},
        {"month": "2026-10-01", "budget": "3000.00", "spent": "3500.50"},
        {"month": "2026-11-01", "budget": "3000.00", "spent": "0"},
    ]


@pytest.fixture
def visa_due_dates(
    admin_client: TestClient, home: HouseholdData, monkeypatch: pytest.MonkeyPatch
) -> list[dict]:
    """Visa vence el 5 de cada mes desde agosto; hoy es 20/10. Agosto se pagó a tiempo,
    septiembre tarde y octubre sigue sin pagar."""
    from app.services import recurring

    monkeypatch.setattr(recurring, "_today", lambda: date(2026, 10, 20))
    admin_client.post(
        "/api/services",
        json={
            "name": "Visa",
            "category_id": str(home.card.id),
            "category_type_id": str(home.visa.id),
            "amount_type": "fixed",
            "estimated_amount": "1000.00",
            "frequency": "monthly",
            "first_due_date": "2026-08-05",
        },
    )
    periods = admin_client.get(
        "/api/service-periods?date_from=2026-08-01&date_to=2026-10-31"
    ).json()
    admin_client.post(
        f"/api/service-periods/{periods[0]['id']}/pay", json={"paid_on": "2026-08-05"}
    )
    admin_client.post(
        f"/api/service-periods/{periods[1]['id']}/pay", json={"paid_on": "2026-09-10"}
    )
    return periods


def test_punctuality(admin_client: TestClient, visa_due_dates: list) -> None:
    data = admin_client.get("/api/reports/punctuality?until=2026-10&months=3").json()

    assert [(m["on_time"], m["late"], m["overdue"]) for m in data["months"]] == [
        (1, 0, 0),
        (0, 1, 0),
        (0, 0, 1),
    ]
    assert data["services"] == [
        {"id": data["services"][0]["id"], "name": "Visa", "on_time": 1, "late": 1, "overdue": 1}
    ]


def test_projection_adds_pending_due_dates(
    admin_client: TestClient, payments: None, visa_due_dates: list
) -> None:
    data = admin_client.get("/api/reports/projection?month=2026-10").json()

    assert data["spent"] == "38500.50"
    assert data["pending"] == "1000.00" and data["pending_count"] == 1
    assert data["projected"] == "39500.50"


# --- Cuánto gastamos: detalle por mes y por año ---------------------------------------------


def _tree(nodes: list[dict]) -> list:
    return [
        (n["name"], n["total"], _tree(n["children"])) if n["children"] else (n["name"], n["total"])
        for n in nodes
    ]


def test_spending_of_a_month_with_full_detail(
    member_client: TestClient, db: Session, home: HouseholdData, payments: None
) -> None:
    db.add_all(
        [
            build_payment(
                home,
                "12000.00",
                occurred_on=date(2026, 10, 20),
                category_id=home.card.id,
                category_type_id=home.visa.id,
            ),
            build_payment(  # un pago del auto cargado sin tipo
                home,
                "800.00",
                occurred_on=date(2026, 10, 21),
                category_id=home.car.id,
                item_id=home.cronos.id,
            ),
        ]
    )
    db.flush()

    data = member_client.get("/api/reports/spending", params={"month": "2026-10"}).json()

    assert data["period"] == "month"
    assert (data["start"], data["end"]) == ("2026-10-01", "2026-10-31")
    assert data["total"] == "51300.50"
    assert data["previous_total"] == "1000.00"  # septiembre
    assert _tree(data["categories"]) == [
        (
            "Auto",
            "35800.00",
            [
                (
                    "Fiat Cronos",
                    "30800.00",
                    [("Seguro", "30000.00"), ("Sin especificar", "800.00")],
                ),
                ("Ford Ka", "5000.00", [("Patente", "5000.00")]),
            ],
        ),
        ("Tarjeta de crédito", "12000.00", [("Visa", "12000.00")]),
        ("Supermercado", "3500.50"),
    ]
    # El gráfico: los 12 meses hasta octubre.
    assert [m["month"] for m in data["months"]][-2:] == ["2026-09-01", "2026-10-01"]
    assert len(data["months"]) == 12


def test_spending_of_a_year(member_client: TestClient, payments: None) -> None:
    data = member_client.get("/api/reports/spending", params={"year": 2026}).json()

    assert data["period"] == "year"
    assert (data["start"], data["end"]) == ("2026-01-01", "2026-12-31")
    assert data["total"] == "39500.50"  # septiembre + octubre, sin el otro hogar
    assert data["previous_total"] == "0"
    assert [m["month"] for m in data["months"]] == [f"2026-{m:02d}-01" for m in range(1, 13)]
    assert [n["name"] for n in data["categories"]] == ["Auto", "Supermercado"]


def test_spending_needs_a_month_or_a_year(member_client: TestClient) -> None:
    response = member_client.get("/api/reports/spending", params={"month": "2026-10", "year": 2026})

    assert response.status_code == 422
