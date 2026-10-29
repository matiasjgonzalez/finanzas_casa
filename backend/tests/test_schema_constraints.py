"""La base de datos rechaza datos inválidos aunque el código de la aplicación tuviera un error.

Estas reglas son la última línea de defensa; la validación con mensajes claros para el usuario
se hará además en los esquemas de Pydantic y en los servicios.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Attachment,
    Budget,
    Category,
    CategoryItem,
    CategoryType,
    Service,
    ServicePayment,
    Transaction,
    User,
)
from app.models.enums import AmountType, ServiceFrequency
from tests.factories import HouseholdData, build_payment, create_household


def assert_rejected(db: Session, obj: object, constraint: str) -> None:
    """Intenta guardar obj dentro de un SAVEPOINT y verifica que PostgreSQL lo rechace
    justamente por la restricción esperada (y no por otro motivo)."""
    with pytest.raises(IntegrityError) as error, db.begin_nested():
        db.add(obj)
        db.flush()
    assert error.value.orig.diag.constraint_name == constraint


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


def build_service(home: HouseholdData, **overrides: object) -> Service:
    values: dict[str, object] = {
        "household_id": home.household.id,
        "name": "Luz",
        "category_id": home.supermarket.id,
        "amount_type": AmountType.FIXED,
        "estimated_amount": Decimal("45000.00"),
        "frequency": ServiceFrequency.MONTHLY,
        "first_due_date": date(2026, 10, 10),
        "created_by_id": home.admin.id,
    }
    values.update(overrides)
    return Service(**values)


# --- Pagos ---------------------------------------------------------------------------------


def test_payment_amount_is_stored_with_exact_decimal_precision(
    db: Session, home: HouseholdData
) -> None:
    db.add(build_payment(home, amount="1234567.89"))
    db.flush()
    db.expire_all()

    stored = db.scalars(select(Transaction)).one()
    assert stored.amount == Decimal("1234567.89")
    assert stored.currency == "ARS"


@pytest.mark.parametrize("amount", ["0", "-10.50"])
def test_amount_must_be_positive(db: Session, home: HouseholdData, amount: str) -> None:
    assert_rejected(db, build_payment(home, amount=amount), "ck_transactions_amount_positive")


def test_payment_requires_category(db: Session, home: HouseholdData) -> None:
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(build_payment(home, category_id=None))
        db.flush()


def test_type_must_belong_to_the_payment_category(db: Session, home: HouseholdData) -> None:
    """Un tipo de Auto (Seguro) no puede usarse en un pago de Tarjeta de crédito."""
    assert_rejected(
        db,
        build_payment(home, category_id=home.card.id, category_type_id=home.insurance.id),
        "fk_transactions_category_id_category_type_id_category_types",
    )


def test_item_must_belong_to_the_payment_category(db: Session, home: HouseholdData) -> None:
    assert_rejected(
        db,
        build_payment(home, category_id=home.card.id, item_id=home.cronos.id),
        "fk_transactions_category_id_item_id_category_items",
    )


def test_car_payment_with_item_and_type_is_accepted(db: Session, home: HouseholdData) -> None:
    db.add(
        build_payment(
            home,
            category_id=home.car.id,
            item_id=home.cronos.id,
            category_type_id=home.insurance.id,
        )
    )
    db.flush()


# --- Aislamiento entre hogares -------------------------------------------------------------


def test_transaction_cannot_use_category_from_another_household(
    db: Session, home: HouseholdData
) -> None:
    other = create_household(db, name="Otro hogar")

    assert_rejected(
        db,
        build_payment(home, category_id=other.supermarket.id),
        "fk_transactions_household_id_category_id_categories",
    )


def test_transaction_cannot_be_created_by_user_of_another_household(
    db: Session, home: HouseholdData
) -> None:
    other = create_household(db, name="Otro hogar")

    assert_rejected(
        db,
        build_payment(home, created_by_id=other.admin.id),
        "fk_transactions_household_id_created_by_id_users",
    )


# --- Catálogos y usuarios ------------------------------------------------------------------


def test_category_names_are_unique_per_household_ignoring_case(
    db: Session, home: HouseholdData
) -> None:
    duplicate = Category(household_id=home.household.id, name="SUPERMERCADO")
    assert_rejected(db, duplicate, "uq_categories_household_name")


def test_type_and_item_names_are_unique_per_category(db: Session, home: HouseholdData) -> None:
    h = home.household.id
    assert_rejected(
        db,
        CategoryType(household_id=h, category_id=home.card.id, name="VISA"),
        "uq_category_types_category_name",
    )
    assert_rejected(
        db,
        CategoryItem(household_id=h, category_id=home.car.id, name="fiat cronos"),
        "uq_category_items_category_name",
    )


def test_type_cannot_belong_to_a_category_of_another_household(
    db: Session, home: HouseholdData
) -> None:
    other = create_household(db, name="Otro hogar")
    assert_rejected(
        db,
        CategoryType(household_id=home.household.id, category_id=other.card.id, name="Amex"),
        "fk_category_types_household_id_category_id_categories",
    )


def test_same_category_name_is_allowed_in_another_household(
    db: Session, home: HouseholdData
) -> None:
    create_household(db, name="Otro hogar")  # también crea "Supermercado"


def test_user_username_is_unique_ignoring_case(db: Session, home: HouseholdData) -> None:
    duplicate = User(
        household_id=home.household.id,
        username=home.admin.username.upper(),
        full_name="Duplicado",
        password_hash="hash-no-real",
    )
    assert_rejected(db, duplicate, "uq_users_username_lower")


# --- Servicios y vencimientos --------------------------------------------------------------


def test_fixed_service_requires_amount(db: Session, home: HouseholdData) -> None:
    assert_rejected(
        db, build_service(home, estimated_amount=None), "ck_services_fixed_requires_amount"
    )


def test_variable_service_may_have_no_amount(db: Session, home: HouseholdData) -> None:
    db.add(build_service(home, amount_type=AmountType.VARIABLE, estimated_amount=None))
    db.flush()


def test_service_period_cannot_be_duplicated(db: Session, home: HouseholdData) -> None:
    service = build_service(home)
    db.add(service)
    db.flush()
    db.add(
        ServicePayment(
            household_id=home.household.id, service_id=service.id, due_date=date(2026, 10, 10)
        )
    )
    db.flush()

    duplicate = ServicePayment(
        household_id=home.household.id, service_id=service.id, due_date=date(2026, 10, 10)
    )
    assert_rejected(db, duplicate, "uq_service_payments_service_id_due_date")


def test_paid_period_requires_payment_date_and_amount(db: Session, home: HouseholdData) -> None:
    service = build_service(home)
    db.add(service)
    db.flush()

    assert_rejected(
        db,
        ServicePayment(
            household_id=home.household.id,
            service_id=service.id,
            due_date=date(2026, 10, 10),
            status="paid",
        ),
        "ck_service_payments_paid_requires_data",
    )


def test_one_expense_cannot_pay_two_service_periods(db: Session, home: HouseholdData) -> None:
    """Evita registrar dos veces el mismo gasto al pagar servicios."""
    service = build_service(home)
    expense = build_payment(home, amount="45000.00")
    db.add_all([service, expense])
    db.flush()

    def paid_period(due: date) -> ServicePayment:
        return ServicePayment(
            household_id=home.household.id,
            service_id=service.id,
            due_date=due,
            status="paid",
            paid_on=due,
            amount_paid=Decimal("45000.00"),
            transaction_id=expense.id,
        )

    db.add(paid_period(date(2026, 10, 10)))
    db.flush()
    assert_rejected(db, paid_period(date(2026, 11, 10)), "uq_service_payments_transaction_id")


# --- Presupuestos y comprobantes -----------------------------------------------------------


def test_budget_month_must_be_first_day(db: Session, home: HouseholdData) -> None:
    budget = Budget(
        household_id=home.household.id,
        category_id=home.supermarket.id,
        month=date(2026, 10, 15),
        amount=Decimal("350000"),
        created_by_id=home.admin.id,
    )
    assert_rejected(db, budget, "ck_budgets_month_first_day")


def test_attachment_must_belong_to_exactly_one_owner(db: Session, home: HouseholdData) -> None:
    orphan = Attachment(
        household_id=home.household.id,
        storage_key=uuid.uuid4().hex,
        original_filename="factura.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        sha256="0" * 64,
        uploaded_by_id=home.admin.id,
    )
    assert_rejected(db, orphan, "ck_attachments_single_owner")
