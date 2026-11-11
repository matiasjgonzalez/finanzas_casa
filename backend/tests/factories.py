"""Datos de apoyo para las pruebas (solo existen dentro de la transacción de cada prueba)."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Category, CategoryItem, CategoryType, Household, Transaction, User
from app.models.enums import CategoryStructure, UserRole

PASSWORD = "contraseña-de-prueba"


@dataclass
class HouseholdData:
    household: Household
    admin: User
    # Sin subdivisión
    supermarket: Category
    # Con tipos
    card: Category
    visa: CategoryType
    mastercard: CategoryType
    # Con elementos y tipos
    car: Category
    cronos: CategoryItem
    ka: CategoryItem
    insurance: CategoryType
    plate_tax: CategoryType


def create_user(
    db: Session,
    household: Household,
    *,
    role: UserRole = UserRole.MEMBER,
    username: str | None = None,
    is_active: bool = True,
) -> User:
    user = User(
        household_id=household.id,
        username=username or f"{role.value}-{uuid.uuid4().hex[:8]}",
        full_name=f"{role.value.title()} de prueba",
        password_hash=hash_password(PASSWORD),
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.flush()
    return user


def create_household(db: Session, name: str = "Hogar de prueba") -> HouseholdData:
    household = Household(name=name)
    db.add(household)
    db.flush()
    h = household.id

    admin = create_user(db, household, role=UserRole.ADMIN)
    supermarket = Category(household_id=h, name="Supermercado")
    card = Category(household_id=h, name="Tarjeta de crédito", structure=CategoryStructure.TYPES)
    car = Category(
        household_id=h, name="Auto", structure=CategoryStructure.ITEMS_AND_TYPES, item_label="Auto"
    )
    db.add_all([supermarket, card, car])
    db.flush()

    visa = CategoryType(household_id=h, category_id=card.id, name="Visa")
    mastercard = CategoryType(household_id=h, category_id=card.id, name="Mastercard")
    insurance = CategoryType(household_id=h, category_id=car.id, name="Seguro")
    plate_tax = CategoryType(household_id=h, category_id=car.id, name="Patente")
    cronos = CategoryItem(household_id=h, category_id=car.id, name="Fiat Cronos")
    ka = CategoryItem(household_id=h, category_id=car.id, name="Ford Ka")
    db.add_all([visa, mastercard, insurance, plate_tax, cronos, ka])
    db.flush()
    return HouseholdData(
        household, admin, supermarket, card, visa, mastercard, car, cronos, ka, insurance, plate_tax
    )


def build_payment(data: HouseholdData, amount: str = "1500.00", **overrides: object) -> Transaction:
    values: dict[str, object] = {
        "household_id": data.household.id,
        "description": "Compra",
        "amount": Decimal(amount),
        "occurred_on": date(2026, 10, 1),
        "category_id": data.supermarket.id,
        "created_by_id": data.admin.id,
    }
    values.update(overrides)
    return Transaction(**values)


def login(client: TestClient, user: User, password: str = PASSWORD) -> TestClient:
    """Inicia sesión y configura el encabezado CSRF, como hace el frontend."""
    response = client.post(
        "/api/auth/login", json={"username": user.username, "password": password}
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = client.cookies["ff_csrf"]
    return client


class HouseholdView:
    """Cliente que consulta con scope=household ("Gastos del hogar", solo administradores)."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def get(self, url: str, params: dict | None = None, **kwargs: object) -> object:
        # httpx descarta la query de la URL cuando además se pasan params: se suma a uno u otro.
        if params is not None:
            return self.client.get(url, params={**params, "scope": "household"}, **kwargs)
        separator = "&" if "?" in url else "?"
        return self.client.get(f"{url}{separator}scope=household", **kwargs)

    def __getattr__(self, name: str) -> object:
        return getattr(self.client, name)
