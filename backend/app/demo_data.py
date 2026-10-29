"""Datos de ejemplo para probar la aplicación: pagos y vencimientos aleatorios.

Uso (desde la carpeta backend, con el entorno virtual activado):

    python -m app.demo_data cargar "Mi hogar"   (genera pagos y vencimientos de ejemplo)
    python -m app.demo_data borrar              (elimina exactamente lo que se generó)

Usa las categorías, tipos y elementos que el hogar YA tiene (no crea ni modifica el catálogo).
Todo se crea con la misma lógica que la aplicación (validaciones e historial). Lo generado se
anota en storage/demo_data.json para poder borrarlo después sin tocar los datos reales.
"""

import json
import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    AuditLog,
    Budget,
    Category,
    CategoryItem,
    CategoryType,
    Household,
    Service,
    ServicePayment,
    Transaction,
    User,
)
from app.models.enums import AmountType, CategoryStructure, ServiceFrequency, UserRole
from app.schemas.service import PayInput, ServiceInput
from app.schemas.transaction import TransactionInput
from app.services import budgets as budgets_service
from app.services import recurring
from app.services import transactions as transactions_service

MANIFEST = get_settings().storage_dir / "demo_data.json"
MARK = "Dato de ejemplo"

# Vencimientos por nombre de tipo: (frecuencia, día del mes, importe fijo o None si es variable,
# importe aproximado). Se aplican solo a los tipos que existan en el hogar.
SCHEDULES: dict[str, tuple[ServiceFrequency, int, int | None, int]] = {
    # Servicios
    "luz": (ServiceFrequency.MONTHLY, 12, None, 45_000),
    "agua": (ServiceFrequency.BIMONTHLY, 20, 28_500, 28_500),
    "gas": (ServiceFrequency.MONTHLY, 15, None, 30_000),
    "internet": (ServiceFrequency.MONTHLY, 10, 32_999, 32_999),
    "celular": (ServiceFrequency.MONTHLY, 8, 18_500, 18_500),
    # Tarjetas (el resumen cambia cada mes)
    "amex": (ServiceFrequency.MONTHLY, 5, None, 420_000),
    "macro": (ServiceFrequency.MONTHLY, 9, None, 610_000),
    "nación": (ServiceFrequency.MONTHLY, 14, None, 280_000),
    "naranja": (ServiceFrequency.MONTHLY, 22, None, 190_000),
    "visa": (ServiceFrequency.MONTHLY, 7, None, 350_000),
    "mastercard": (ServiceFrequency.MONTHLY, 11, None, 300_000),
    # Auto (uno por cada auto)
    "seguro": (ServiceFrequency.MONTHLY, 3, 88_000, 88_000),
    "patente": (ServiceFrequency.BIMONTHLY, 18, 46_000, 46_000),
    # Inmobiliario
    "provincial": (ServiceFrequency.BIMONTHLY, 25, 38_000, 38_000),
    "munincipal": (ServiceFrequency.MONTHLY, 16, 21_000, 21_000),
    "municipal": (ServiceFrequency.MONTHLY, 16, 21_000, 21_000),
}

# Pagos sueltos: (nombre de categoría o tipo, descripciones, importe mínimo, máximo, por mes)
LOOSE = {
    "supermercado": (
        ["Coto", "Carrefour", "Día", "Changomás", "Verdulería", "Carnicería"],
        8_000,
        120_000,
        10,
    ),
    "otros": (
        ["Farmacia", "Peluquería", "Regalo de cumpleaños", "Ferretería", "Librería", "Veterinaria"],
        3_000,
        65_000,
        5,
    ),
    "nafta": (["Carga de nafta"], 25_000, 70_000, 3),
    "service": (["Service del auto"], 180_000, 350_000, 0.25),
    "rentas provincial": (["Rentas provincial"], 30_000, 60_000, 0.3),
    "rentas municipal": (["Rentas municipal"], 15_000, 35_000, 0.3),
}

START = date(2026, 7, 1)


def _money(rng: random.Random, low: float, high: float) -> Decimal:
    # Importes "de verdad": redondeados a 10 pesos, con centavos a veces.
    value = rng.uniform(low, high)
    cents = rng.choice([0, 0, 0, 50, 99])
    return Decimal(int(value) // 10 * 10) + Decimal(cents) / 100


def _day(month_start: date, day: int) -> date:
    return month_start.replace(day=min(day, 28))


def load(db: Session, household_name: str) -> int:
    if MANIFEST.exists():
        print(
            "Ya hay datos de ejemplo cargados. Borralos primero con: python -m app.demo_data borrar"
        )
        return 1
    household = db.scalar(
        select(Household).where(func.lower(Household.name) == household_name.lower())
    )
    if household is None:
        print(f"No existe el hogar «{household_name}».")
        return 1
    users = list(db.scalars(select(User).where(User.household_id == household.id, User.is_active)))
    admin = next((u for u in users if u.role == UserRole.ADMIN), None)
    if admin is None:
        print(
            "El hogar necesita un administrador (los vencimientos los programa un administrador)."
        )
        return 1

    rng = random.Random(2026)  # noqa: S311 - datos de ejemplo, no criptografía
    today = recurring._today()
    created: dict[str, list[str]] = {"services": [], "transactions": [], "budgets": []}

    categories = list(
        db.scalars(
            select(Category).where(Category.household_id == household.id, Category.is_active)
        )
    )
    for category in categories:
        types = list(
            db.scalars(
                select(CategoryType).where(
                    CategoryType.category_id == category.id, CategoryType.is_active
                )
            )
        )
        items = list(
            db.scalars(
                select(CategoryItem).where(
                    CategoryItem.category_id == category.id, CategoryItem.is_active
                )
            )
        )
        uses_items = category.structure == CategoryStructure.ITEMS_AND_TYPES
        paths = (
            [(t, i) for t in types for i in items]
            if uses_items
            else [(t, None) for t in types]
            if category.structure == CategoryStructure.TYPES
            else []
        )

        # 1. Vencimientos programados (tipos conocidos) y sus pagos pasados.
        for ctype, item in paths:
            schedule = SCHEDULES.get(ctype.name.strip().lower())
            if schedule is None:
                continue
            frequency, day, fixed, approx = schedule
            if item is not None and fixed:
                fixed = int(fixed * rng.uniform(0.85, 1.2)) // 100 * 100  # cada auto, su importe
            service = recurring.create_service(
                db,
                admin,
                ServiceInput(
                    name=" · ".join(filter(None, [ctype.name, item.name if item else None])),
                    category_id=category.id,
                    category_type_id=ctype.id,
                    item_id=item.id if item else None,
                    amount_type=AmountType.FIXED if fixed else AmountType.VARIABLE,
                    estimated_amount=Decimal(fixed) if fixed else Decimal(approx),
                    frequency=frequency,
                    first_due_date=_day(START, day),
                    notes=MARK,
                ),
            )
            created["services"].append(str(service.id))

        # 2. Pagos sueltos (supermercado, nafta…), repartidos entre los integrantes.
        targets = (
            [(None, None, category.name)]
            if category.structure == CategoryStructure.SIMPLE
            else [(t, i, t.name) for t, i in (paths or [])]
        )
        for ctype, item, name in targets:
            rule = LOOSE.get(name.strip().lower())
            if rule is None:
                continue
            descriptions, low, high, per_month = rule
            days = (today - START).days
            count = (
                max(1, round(per_month * days / 30))
                if per_month >= 1
                else int(rng.random() < per_month * 4)
            )
            for _ in range(count):
                tx = transactions_service.create_transaction(
                    db,
                    rng.choice(users),
                    TransactionInput(
                        amount=_money(rng, low, high),
                        occurred_on=START + timedelta(days=rng.randint(0, days)),
                        category_id=category.id,
                        category_type_id=ctype.id if ctype else None,
                        item_id=item.id if item else None,
                        description=rng.choice(descriptions),
                        notes=MARK,
                    ),
                )
                created["transactions"].append(str(tx.id))

    # 3. Se pagan los vencimientos pasados. Algunos recientes quedan sin pagar (vencidos).
    recurring.ensure_periods(db, household.id, today + timedelta(days=90))
    service_ids = [uuid.UUID(s) for s in created["services"]]
    past = db.scalars(
        select(ServicePayment)
        .where(ServicePayment.service_id.in_(service_ids), ServicePayment.due_date < today)
        .order_by(ServicePayment.due_date)
    ).all()
    overdue = 0
    for period in past:
        if (today - period.due_date).days <= 20 and rng.random() < 0.3:
            overdue += 1
            continue
        service = db.get(Service, period.service_id)
        amount = None
        if service.amount_type == AmountType.VARIABLE:
            amount = _money(
                rng, float(service.estimated_amount) * 0.7, float(service.estimated_amount) * 1.3
            )
        paid = recurring.pay_period(
            db,
            rng.choice(users),
            period.id,
            PayInput(
                mode="create",
                paid_on=period.due_date - timedelta(days=rng.randint(0, 4)),
                amount=amount,
            ),
        )
        created["transactions"].append(str(paid.transaction_id))

    # 4. Presupuestos de ejemplo (uno holgado y uno ajustado, para ver los dos estados).
    for name, amount in (("supermercado", 650_000), ("otros", 150_000)):
        category = next((c for c in categories if c.name.strip().lower() == name), None)
        if category is None:
            continue
        budgets_service.set_budget(db, admin, category.id, START, Decimal(amount))
        budget = db.scalar(
            select(Budget).where(Budget.category_id == category.id, Budget.month == START)
        )
        created["budgets"].append(str(budget.id))

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"household_id": str(household.id), **created}, indent=2))
    print(
        f"Listo: {len(created['services'])} vencimientos programados, "
        f"{len(created['transactions'])} pagos ({len(past) - overdue} de vencimientos pagados), "
        f"{overdue} vencimientos quedaron vencidos sin pagar, "
        f"{len(created['budgets'])} presupuestos."
    )
    return 0


def remove(db: Session) -> int:
    if not MANIFEST.exists():
        print("No hay datos de ejemplo para borrar.")
        return 0
    data = json.loads(MANIFEST.read_text())
    services = [uuid.UUID(s) for s in data["services"]]
    transactions = [uuid.UUID(t) for t in data["transactions"]]
    periods = db.scalars(select(ServicePayment.id).where(ServicePayment.service_id.in_(services)))
    ids = [str(x) for x in [*services, *transactions, *periods]]
    db.execute(delete(ServicePayment).where(ServicePayment.service_id.in_(services)))
    db.execute(delete(Transaction).where(Transaction.id.in_(transactions)))
    db.execute(delete(Service).where(Service.id.in_(services)))
    budgets = [uuid.UUID(b) for b in data.get("budgets", [])]
    db.execute(delete(Budget).where(Budget.id.in_(budgets)))
    ids += [str(b) for b in budgets]
    db.execute(delete(AuditLog).where(AuditLog.entity_id.in_(ids)))
    db.commit()
    MANIFEST.unlink()
    print(f"Se borraron {len(services)} vencimientos y {len(transactions)} pagos de ejemplo.")
    return 0


def main(argv: list[str]) -> int:
    from app.core.database import SessionLocal

    if not argv or argv[0] not in {"cargar", "borrar"}:
        print(__doc__)
        return 1
    with SessionLocal() as db:
        if argv[0] == "cargar":
            return load(db, argv[1] if len(argv) > 1 else "Mi hogar")
        return remove(db)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
