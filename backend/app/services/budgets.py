"""Presupuestos mensuales por categoría.

Un presupuesto rige desde su mes en adelante, hasta que se cambia: fijar $500.000 para
Supermercado en octubre vale para octubre, noviembre, diciembre… Cambiarlo en enero crea
otra fila desde enero, así los meses anteriores conservan el límite que tenían. Quitarlo
guarda una fila "sin presupuesto" (importe vacío) desde ese mes.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction, User
from app.models.enums import TransactionStatus
from app.schemas.transaction import NamedRef
from app.services import audit, catalog, reports
from app.services.reports import month_end, month_start

# Avisa al llegar al 80 % del límite.
WARNING_RATIO = Decimal("0.8")

BudgetStatus = Literal["ok", "warning", "exceeded"]


class BudgetOut(BaseModel):
    category: NamedRef
    amount: Decimal
    spent: Decimal
    # Mes desde el que rige este límite.
    since: date
    status: BudgetStatus


def _status(amount: Decimal, spent: Decimal) -> BudgetStatus:
    if spent > amount:
        return "exceeded"
    if spent >= amount * WARNING_RATIO:
        return "warning"
    return "ok"


def list_for_month(db: Session, household_id: uuid.UUID, month: date) -> list[BudgetOut]:
    month = month_start(month)
    # Para cada categoría, la fila vigente: la de mes más reciente que no sea posterior.
    latest = (
        select(Budget)
        .where(Budget.household_id == household_id, Budget.month <= month)
        .order_by(Budget.category_id, Budget.month.desc())
        .distinct(Budget.category_id)
        .subquery()
    )
    spent = (
        select(Transaction.category_id, func.sum(Transaction.amount).label("spent"))
        .where(
            Transaction.household_id == household_id,
            Transaction.status == TransactionStatus.CONFIRMED,
            Transaction.occurred_on.between(month, month_end(month)),
        )
        .group_by(Transaction.category_id)
        .subquery()
    )
    rows = db.execute(
        select(Category, latest.c.amount, latest.c.month, func.coalesce(spent.c.spent, 0))
        .join(latest, latest.c.category_id == Category.id)
        .outerjoin(spent, spent.c.category_id == Category.id)
        .where(latest.c.amount.is_not(None))
        .order_by(func.lower(Category.name))
    )
    return [
        BudgetOut(
            category=NamedRef.model_validate(category),
            amount=amount,
            spent=Decimal(used),
            since=since,
            status=_status(amount, Decimal(used)),
        )
        for category, amount, since, used in rows
    ]


def set_budget(
    db: Session, admin: User, category_id: uuid.UUID, month: date, amount: Decimal | None
) -> None:
    """Fija (o quita, con amount=None) el presupuesto de la categoría desde `month`."""
    category = catalog.get_category(db, admin.household_id, category_id)
    month = month_start(month)
    budget = db.scalar(
        select(Budget).where(Budget.category_id == category.id, Budget.month == month)
    )
    if budget is None:
        budget = Budget(
            household_id=admin.household_id,
            category_id=category.id,
            month=month,
            created_by_id=admin.id,
        )
        db.add(budget)
    budget.amount = amount
    db.flush()
    audit.record(
        db,
        "budget.set" if amount is not None else "budget.removed",
        actor=admin,
        entity_type="budget",
        entity_id=budget.id,
        details={
            "category": category.name,
            "since": month.isoformat(),
            "amount": str(amount) if amount is not None else None,
        },
    )
    db.commit()


class BudgetMonth(BaseModel):
    month: date
    budget: Decimal | None  # límite vigente ese mes (None: sin presupuesto)
    spent: Decimal


def history(
    db: Session, household_id: uuid.UUID, category_id: uuid.UUID, *, until: date, months: int = 12
) -> list[BudgetMonth]:
    """Presupuesto contra gastado de una categoría, mes a mes."""
    category = catalog.get_category(db, household_id, category_id)
    rows = list(
        db.scalars(
            select(Budget)
            .where(Budget.category_id == category.id, Budget.month <= month_start(until))
            .order_by(Budget.month)
        )
    )
    spent = {
        m.month: m.total
        for m in reports.monthly(
            db, household_id, until=until, months=months, category_id=category.id
        )
    }
    result = []
    for month, total in spent.items():
        # El vigente es la última fila que no sea posterior al mes.
        current = None
        for row in rows:
            if row.month <= month:
                current = row.amount
        result.append(BudgetMonth(month=month, budget=current, spent=total))
    return result
