"""Revisión de seguridad automática sobre TODAS las rutas de la API.

Las rutas se toman de la documentación OpenAPI: si mañana se agrega una ruta nueva sin
proteger, estas pruebas fallan sin necesidad de acordarse de escribirle una prueba.
"""

import re
import uuid
from collections.abc import Callable
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.main import app, create_app
from app.models import Service, ServicePayment
from app.models.enums import AmountType, ServiceFrequency
from app.services.households import create_superadmin
from tests.factories import PASSWORD, HouseholdData, build_payment, create_household, login

PUBLIC = {("POST", "/api/auth/login"), ("GET", "/api/health"), ("GET", "/api/ping")}
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _routes() -> list[tuple[str, str]]:
    return sorted(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    )


def _fill(path: str, value: str | None = None) -> str:
    return re.sub(r"\{[^}]+\}", lambda _: value or str(uuid.uuid4()), path)


ROUTES = _routes()


def test_routes_were_found() -> None:
    # Protección contra una prueba que pasa porque no revisó nada.
    assert len(ROUTES) > 50


@pytest.mark.parametrize(("method", "path"), [r for r in ROUTES if r not in PUBLIC])
def test_every_route_requires_a_session(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, _fill(path))

    assert response.status_code == 401, response.text


@pytest.mark.parametrize(
    ("method", "path"),
    [r for r in ROUTES if r[0] in MUTATING and r not in PUBLIC],
)
def test_every_change_requires_the_csrf_token(
    client_factory: Callable[[], TestClient], db: Session, method: str, path: str
) -> None:
    if path.startswith("/api/households"):
        user = create_superadmin(
            db, full_name="Super", username="super", password=PASSWORD, must_change_password=False
        )
    else:
        user = create_household(db).admin
    client = login(client_factory(), user)
    del client.headers["X-CSRF-Token"]  # como haría otro sitio: tiene la cookie, no el token

    response = client.request(method, _fill(path))

    assert response.status_code == 403
    assert "rechazada por seguridad" in response.json()["detail"]


# --- Aislamiento entre hogares: con los identificadores de OTRO hogar, todo responde 404 ----


@pytest.fixture
def other_household_ids(db: Session, tmp_path: Path) -> dict[str, str]:
    other = create_household(db, name="Otro hogar")
    payment = build_payment(other)
    db.add(payment)
    db.flush()
    service = Service(
        household_id=other.household.id,
        name="Visa",
        category_id=other.card.id,
        category_type_id=other.visa.id,
        amount_type=AmountType.FIXED,
        estimated_amount=1000,
        frequency=ServiceFrequency.MONTHLY,
        first_due_date=date(2026, 10, 5),
        created_by_id=other.admin.id,
    )
    db.add(service)
    db.flush()
    period = ServicePayment(
        household_id=other.household.id, service_id=service.id, due_date=date(2026, 10, 5)
    )
    db.add(period)
    db.flush()
    return {
        "category_id": str(other.card.id),
        "type_id": str(other.visa.id),
        "item_id": str(other.cronos.id),
        "transaction_id": str(payment.id),
        "service_id": str(service.id),
        "period_id": str(period.id),
        "user_id": str(other.admin.id),
        "household_id": str(other.household.id),
    }


ID_ROUTES = [
    (m, p)
    for m, p in ROUTES
    if "{" in p
    and m in {"GET", "DELETE"}
    and not p.startswith("/api/households")
    and "attachment" not in p
]


@pytest.mark.parametrize(("method", "path"), ID_ROUTES)
def test_ids_of_another_household_are_not_found(
    client_factory: Callable[[], TestClient],
    db: Session,
    other_household_ids: dict[str, str],
    method: str,
    path: str,
) -> None:
    home: HouseholdData = create_household(db)
    client = login(client_factory(), home.admin)
    params = re.findall(r"\{([^}]+)\}", path)
    url = path
    for name in params:
        url = url.replace("{" + name + "}", other_household_ids[name])

    response = client.request(method, url)

    assert response.status_code == 404, f"{method} {url}: {response.status_code} {response.text}"


def test_isolation_covers_every_kind_of_id() -> None:
    names = {n for _, p in ID_ROUTES for n in re.findall(r"\{([^}]+)\}", p)}
    assert {"category_id", "transaction_id", "service_id", "period_id", "user_id"} <= names


# --- Encabezados de seguridad ---------------------------------------------------------------


def test_security_headers_on_api(client: TestClient) -> None:
    headers = client.get("/api/health").headers

    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "same-origin"
    # Una respuesta de la API nunca se comporta como página.
    assert headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_web_page_has_a_strict_content_policy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text(
        "<html><head><script>document.title='x'</script></head><body></body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(get_settings(), "frontend_dist", dist)

    policy = TestClient(create_app()).get("/pagos").headers["content-security-policy"]

    assert "default-src 'self'" in policy
    assert "frame-ancestors 'none'" in policy
    assert "object-src 'none'" in policy
    # El script en línea se autoriza solo por su hash, nunca con 'unsafe-inline'.
    script_src = next(p for p in policy.split("; ") if p.startswith("script-src"))
    assert "'sha256-" in script_src and "unsafe-inline" not in script_src


# Cambios con identificadores de otro hogar: cada ruta con un pedido válido (si no, la validación
# respondería 422 antes de llegar a buscar el registro).
PDF = ("factura.pdf", b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\n%%EOF", "application/pdf")


def _bodies(home: HouseholdData) -> dict[tuple[str, str], dict]:
    payment = {
        "amount": "10.00",
        "occurred_on": "2026-10-01",
        "category_id": str(home.supermarket.id),
    }
    service = {
        "name": "X",
        "category_id": str(home.card.id),
        "category_type_id": str(home.visa.id),
        "amount_type": "variable",
        "frequency": "monthly",
        "first_due_date": "2026-10-01",
    }
    name = {"json": {"name": "Nuevo nombre"}}
    return {
        ("PATCH", "/api/categories/{category_id}"): name,
        ("POST", "/api/categories/{category_id}/types"): name,
        ("POST", "/api/categories/{category_id}/items"): name,
        ("PATCH", "/api/category-types/{type_id}"): name,
        ("PATCH", "/api/category-items/{item_id}"): name,
        ("PUT", "/api/budgets/{category_id}"): {"json": {"month": "2026-10", "amount": "10.00"}},
        ("PUT", "/api/transactions/{transaction_id}"): {"json": payment},
        ("POST", "/api/transactions/{transaction_id}/attachments"): {"files": {"file": PDF}},
        ("PUT", "/api/services/{service_id}"): {"json": service},
        ("PATCH", "/api/service-periods/{period_id}"): {"json": {"notes": "x"}},
        ("POST", "/api/service-periods/{period_id}/pay"): {"json": {"amount": "10.00"}},
        ("POST", "/api/service-periods/{period_id}/unpay"): {"json": {}},
        ("POST", "/api/service-periods/{period_id}/attachments"): {"files": {"file": PDF}},
        ("PATCH", "/api/users/{user_id}"): {"json": {"full_name": "X"}},
        ("POST", "/api/users/{user_id}/reset-password"): {"json": {"new_password": "otra-clave-1"}},
    }


MUTATING_ID_ROUTES = [
    (m, p)
    for m, p in ROUTES
    if "{" in p
    and m in MUTATING - {"DELETE"}
    and not p.startswith("/api/households")
    and not p.startswith("/api/attachments")
]


def test_every_change_route_is_covered(db: Session) -> None:
    """Si se agrega una ruta nueva que modifica algo por identificador, hay que sumarla acá."""
    assert set(MUTATING_ID_ROUTES) == set(_bodies(create_household(db)))


@pytest.mark.parametrize(("method", "path"), MUTATING_ID_ROUTES)
def test_changes_with_ids_of_another_household_are_not_found(
    client_factory: Callable[[], TestClient],
    db: Session,
    other_household_ids: dict[str, str],
    method: str,
    path: str,
) -> None:
    home = create_household(db)
    client = login(client_factory(), home.admin)
    url = path
    for name in re.findall(r"\{([^}]+)\}", path):
        url = url.replace("{" + name + "}", other_household_ids[name])

    response = client.request(method, url, **_bodies(home)[(method, path)])

    assert response.status_code == 404, f"{method} {url}: {response.status_code} {response.text}"
