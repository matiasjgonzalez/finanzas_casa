"""Casos de borde que protegen los datos: sesiones, archivos huérfanos, historial y datos de
ejemplo (que escriben y borran en la base real del usuario)."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import demo_data
from app.main import app
from app.models import (
    Attachment,
    Budget,
    Category,
    CategoryType,
    Service,
    ServicePayment,
    Transaction,
    UserSession,
)
from app.services import recurring
from app.storage import LocalStorage
from tests.factories import HouseholdData, create_household, login

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def admin_client(client_factory: Callable[[], TestClient], home: HouseholdData) -> TestClient:
    return login(client_factory(), home.admin)


def test_using_the_app_extends_the_session(
    admin_client: TestClient, db: Session, home: HouseholdData
) -> None:
    session = db.scalars(select(UserSession).where(UserSession.user_id == home.admin.id)).one()
    long_ago = datetime.now(UTC) - timedelta(hours=2)
    session.last_seen_at = long_ago
    session.expires_at = long_ago + timedelta(days=1)
    db.flush()

    response = admin_client.get("/api/auth/me")

    db.refresh(session)
    assert response.status_code == 200
    assert session.expires_at > datetime.now(UTC) + timedelta(days=10)  # renovada
    assert "ff_session" in response.headers.get("set-cookie", "")


def test_a_failed_save_does_not_leave_orphan_files(
    client_factory: Callable[[], TestClient],
    db: Session,
    home: HouseholdData,
    storage: LocalStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client_factory()  # deja configurada la base y el almacenamiento de la prueba
    # Como el navegador: recibe la respuesta 500 en lugar de que la prueba reciba la excepción.
    admin_client = login(TestClient(app, raise_server_exceptions=False), home.admin)
    payment = admin_client.post(
        "/api/transactions",
        json={
            "amount": "10.00",
            "occurred_on": "2026-10-01",
            "category_id": str(home.supermarket.id),
        },
    ).json()

    def broken_commit() -> None:
        raise RuntimeError("la base no respondió")

    monkeypatch.setattr(db, "commit", broken_commit)
    response = admin_client.post(
        f"/api/transactions/{payment['id']}/attachments",
        files={"file": ("factura.pdf", PDF, "application/pdf")},
    )

    assert response.status_code == 500
    assert response.json()["detail"].startswith("Ocurrió un error interno")  # sin detalles técnicos
    stored = [p for p in Path(storage.root).rglob("*") if p.is_file()]
    assert stored == []


def test_due_date_history(
    admin_client: TestClient, home: HouseholdData, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(recurring, "_today", lambda: date(2026, 10, 20))
    service = admin_client.post(
        "/api/services",
        json={
            "name": "Visa",
            "category_id": str(home.card.id),
            "category_type_id": str(home.visa.id),
            "amount_type": "variable",
            "frequency": "monthly",
            "first_due_date": "2026-08-05",
        },
    ).json()

    history = admin_client.get(f"/api/services/{service['id']}/periods").json()

    dates = [p["due_date"] for p in history]
    assert dates[:3] == sorted(dates[:3], reverse=True)  # del más reciente al más antiguo
    assert "2026-08-05" in dates and "2026-10-05" in dates


def test_superadmin_renames_a_household(
    client_factory: Callable[[], TestClient], db: Session, home: HouseholdData
) -> None:
    from app.services.households import create_superadmin
    from tests.factories import PASSWORD

    super_user = create_superadmin(
        db, full_name="Super", username="super", password=PASSWORD, must_change_password=False
    )
    client = login(client_factory(), super_user)
    other = create_household(db, name="Otro hogar")
    url = f"/api/households/{home.household.id}"

    renamed = client.patch(url, json={"name": "  Familia Pérez  "})
    duplicate = client.patch(url, json={"name": other.household.name.upper()})

    assert renamed.json()["name"] == "Familia Pérez"
    assert duplicate.status_code == 409


# --- Datos de ejemplo ----------------------------------------------------------------------


def test_demo_data_loads_and_removes_only_what_it_created(
    db: Session, home: HouseholdData, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(demo_data, "MANIFEST", tmp_path / "demo_data.json")
    monkeypatch.setattr(recurring, "_today", lambda: date(2026, 10, 20))
    mine = Transaction(
        household_id=home.household.id,
        amount=123,
        occurred_on=date(2026, 10, 1),
        category_id=home.supermarket.id,
        created_by_id=home.admin.id,
    )
    db.add(mine)
    db.flush()
    catalog_before = (
        db.scalar(select(func.count(Category.id))),
        db.scalar(select(func.count(CategoryType.id))),
    )

    assert demo_data.load(db, home.household.name) == 0
    assert db.scalar(select(func.count(Transaction.id))) > 10
    assert db.scalar(select(func.count(Service.id))) > 0
    assert demo_data.load(db, home.household.name) == 1  # no se carga dos veces

    assert demo_data.remove(db) == 0

    # Queda exactamente lo de antes: el pago propio y el catálogo intactos.
    assert db.scalars(select(Transaction.id)).all() == [mine.id]
    for model in (Service, ServicePayment, Budget, Attachment):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert (
        db.scalar(select(func.count(Category.id))),
        db.scalar(select(func.count(CategoryType.id))),
    ) == catalog_before
    assert not (tmp_path / "demo_data.json").exists()


def test_demo_data_requires_an_existing_household_with_an_admin(
    db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(demo_data, "MANIFEST", tmp_path / "demo_data.json")

    assert demo_data.load(db, "No existe") == 1
    assert "No existe el hogar" in capsys.readouterr().out
