"""Informes: totales, evolución mensual y distribución del gasto.

Todo se calcula en PostgreSQL sobre los pagos confirmados del hogar (los importes se suman
como NUMERIC, sin pasar por float). Ningún informe devuelve datos de otro hogar.
"""

import csv
import io
import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, aliased

from app.models import Category, CategoryItem, CategoryType, Transaction, User
from app.models.enums import TransactionStatus

Group = Literal["category", "type", "item", "member"]


class GroupTotal(BaseModel):
    """Total de un grupo (una categoría, un tipo, un auto o un integrante)."""

    id: uuid.UUID | None  # None: pagos sin tipo o sin elemento
    name: str
    total: Decimal
    count: int


class MonthTotal(BaseModel):
    month: date  # primer día del mes
    total: Decimal
    count: int


class Summary(BaseModel):
    month: date
    total: Decimal
    count: int
    previous_total: Decimal
    by_category: list[GroupTotal]


def month_start(day: date) -> date:
    return day.replace(day=1)


def add_months(month: date, delta: int) -> date:
    index = month.year * 12 + month.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


def month_end(month: date) -> date:
    return date.fromordinal(add_months(month, 1).toordinal() - 1)


def _confirmed(household_id: uuid.UUID) -> list:
    return [
        Transaction.household_id == household_id,
        Transaction.status == TransactionStatus.CONFIRMED,
    ]


def _between(date_from: date | None, date_to: date | None) -> list:
    conditions = []
    if date_from:
        conditions.append(Transaction.occurred_on >= date_from)
    if date_to:
        conditions.append(Transaction.occurred_on <= date_to)
    return conditions


def _totals(
    db: Session, household_id: uuid.UUID, date_from: date, date_to: date
) -> tuple[Decimal, int]:
    total, count = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0), func.count(Transaction.id)).where(
            *_confirmed(household_id), *_between(date_from, date_to)
        )
    ).one()
    return Decimal(total), count


def breakdown(
    db: Session,
    household_id: uuid.UUID,
    *,
    group: Group,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: uuid.UUID | None = None,
) -> list[GroupTotal]:
    """Gasto agrupado, de mayor a menor. Con category_id se analiza una sola categoría
    (ej. Auto por auto, o por tipo)."""
    creator = aliased(User)
    columns = {
        "category": (Category.id, Category.name),
        "type": (CategoryType.id, CategoryType.name),
        "item": (CategoryItem.id, CategoryItem.name),
        "member": (creator.id, creator.full_name),
    }
    key, name = columns[group]
    query: Select = (
        select(key, name, func.sum(Transaction.amount), func.count(Transaction.id))
        .select_from(Transaction)
        .join(Category, Category.id == Transaction.category_id)
        .outerjoin(CategoryType, CategoryType.id == Transaction.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Transaction.item_id)
        .join(creator, creator.id == Transaction.created_by_id)
        .where(*_confirmed(household_id), *_between(date_from, date_to))
        .group_by(key, name)
        .order_by(func.sum(Transaction.amount).desc())
    )
    if category_id:
        query = query.where(Transaction.category_id == category_id)
    empty = {"type": "Sin tipo", "item": "Sin elemento"}
    return [
        GroupTotal(id=row_id, name=row_name or empty.get(group, "—"), total=total, count=count)
        for row_id, row_name, total, count in db.execute(query)
    ]


def monthly(
    db: Session,
    household_id: uuid.UUID,
    *,
    until: date,
    months: int = 12,
    category_id: uuid.UUID | None = None,
    category_type_id: uuid.UUID | None = None,
    item_id: uuid.UUID | None = None,
) -> list[MonthTotal]:
    """Total de cada uno de los últimos `months` meses (los meses sin pagos van en cero).
    Se puede acotar a una categoría, un tipo (ej. Luz) y/o un elemento (ej. un auto)."""
    last = month_start(until)
    first = add_months(last, -(months - 1))
    bucket = func.date_trunc("month", Transaction.occurred_on)
    query = (
        select(bucket, func.sum(Transaction.amount), func.count(Transaction.id))
        .where(*_confirmed(household_id), *_between(first, month_end(last)))
        .group_by(bucket)
    )
    if category_id:
        query = query.where(Transaction.category_id == category_id)
    if category_type_id:
        query = query.where(Transaction.category_type_id == category_type_id)
    if item_id:
        query = query.where(Transaction.item_id == item_id)
    found = {row[0].date(): (row[1], row[2]) for row in db.execute(query)}
    result = []
    for i in range(months):
        month = add_months(first, i)
        total, count = found.get(month, (Decimal(0), 0))
        result.append(MonthTotal(month=month, total=total, count=count))
    return result


class MonthGroups(BaseModel):
    month: date
    total: Decimal
    groups: list[GroupTotal]


def monthly_grouped(
    db: Session,
    household_id: uuid.UUID,
    *,
    group: Literal["category", "type", "item"],
    until: date,
    months: int = 12,
    category_id: uuid.UUID | None = None,
) -> list[MonthGroups]:
    """Evolución desglosada: cada mes, el total de cada categoría (o de cada tipo o elemento
    dentro de una categoría, ej. cada auto). Para gráficos de barras apiladas."""
    last = month_start(until)
    first = add_months(last, -(months - 1))
    columns = {
        "category": (Category.id, Category.name),
        "type": (CategoryType.id, CategoryType.name),
        "item": (CategoryItem.id, CategoryItem.name),
    }
    key, name = columns[group]
    bucket = func.date_trunc("month", Transaction.occurred_on)
    query = (
        select(bucket, key, name, func.sum(Transaction.amount), func.count(Transaction.id))
        .select_from(Transaction)
        .join(Category, Category.id == Transaction.category_id)
        .outerjoin(CategoryType, CategoryType.id == Transaction.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Transaction.item_id)
        .where(*_confirmed(household_id), *_between(first, month_end(last)))
        .group_by(bucket, key, name)
    )
    if category_id:
        query = query.where(Transaction.category_id == category_id)
    empty = {"type": "Sin tipo", "item": "Sin elemento"}
    by_month: dict[date, list[GroupTotal]] = {}
    for bucket_value, row_id, row_name, total, count in db.execute(query):
        by_month.setdefault(bucket_value.date(), []).append(
            GroupTotal(id=row_id, name=row_name or empty.get(group, "—"), total=total, count=count)
        )
    result = []
    for i in range(months):
        month = add_months(first, i)
        groups = sorted(by_month.get(month, []), key=lambda g: g.total, reverse=True)
        result.append(
            MonthGroups(
                month=month, total=sum((g.total for g in groups), Decimal(0)), groups=groups
            )
        )
    return result


class DayTotal(BaseModel):
    date: date
    total: Decimal
    count: int


def daily(db: Session, household_id: uuid.UUID, date_from: date, date_to: date) -> list[DayTotal]:
    """Total de cada día con pagos del rango (para el gasto acumulado del mes)."""
    rows = db.execute(
        select(Transaction.occurred_on, func.sum(Transaction.amount), func.count(Transaction.id))
        .where(*_confirmed(household_id), *_between(date_from, date_to))
        .group_by(Transaction.occurred_on)
        .order_by(Transaction.occurred_on)
    )
    return [DayTotal(date=day, total=total, count=count) for day, total, count in rows]


class SlotTotal(BaseModel):
    slot: int  # día de la semana (1 = lunes … 7 = domingo) o día del mes (1 … 31)
    total: Decimal
    count: int


class Patterns(BaseModel):
    weekdays: list[SlotTotal]
    month_days: list[SlotTotal]


def patterns(
    db: Session, household_id: uuid.UUID, date_from: date | None, date_to: date | None
) -> Patterns:
    """En qué días de la semana y del mes se concentra el gasto."""

    def by(expression: object, slots: int) -> list[SlotTotal]:
        found = {
            int(slot): (total, count)
            for slot, total, count in db.execute(
                select(expression, func.sum(Transaction.amount), func.count(Transaction.id))
                .where(*_confirmed(household_id), *_between(date_from, date_to))
                .group_by(expression)
            )
        }
        return [
            SlotTotal(slot=i, total=found.get(i, (Decimal(0), 0))[0], count=found.get(i, (0, 0))[1])
            for i in range(1, slots + 1)
        ]

    return Patterns(
        weekdays=by(func.extract("isodow", Transaction.occurred_on), 7),
        month_days=by(func.extract("day", Transaction.occurred_on), 31),
    )


def summary(db: Session, household_id: uuid.UUID, month: date) -> Summary:
    month = month_start(month)
    total, count = _totals(db, household_id, month, month_end(month))
    previous = add_months(month, -1)
    previous_total, _ = _totals(db, household_id, previous, month_end(previous))
    return Summary(
        month=month,
        total=total,
        count=count,
        previous_total=previous_total,
        by_category=breakdown(
            db, household_id, group="category", date_from=month, date_to=month_end(month)
        ),
    )


def _amount_es(value: Decimal) -> str:
    """1234.5 → "1234,50": así lo interpreta Excel con configuración regional argentina."""
    return f"{value:.2f}".replace(".", ",")


def export_csv(
    db: Session, household_id: uuid.UUID, date_from: date | None, date_to: date | None
) -> str:
    """Pagos del período en CSV para abrir con Excel (separador ; y coma decimal)."""
    creator = aliased(User)
    rows = db.execute(
        select(Transaction, Category.name, CategoryItem.name, CategoryType.name, creator.full_name)
        .join(Category, Category.id == Transaction.category_id)
        .outerjoin(CategoryType, CategoryType.id == Transaction.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Transaction.item_id)
        .join(creator, creator.id == Transaction.created_by_id)
        .where(*_confirmed(household_id), *_between(date_from, date_to))
        .order_by(Transaction.occurred_on, Transaction.created_at)
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(
        [
            "Fecha de pago",
            "Importe",
            "Categoría",
            "Elemento",
            "Tipo",
            "Descripción",
            "Observaciones",
            "Cargado por",
        ]
    )
    for tx, category, item, ctype, member in rows:
        writer.writerow(
            [
                tx.occurred_on.strftime("%d/%m/%Y"),
                _amount_es(tx.amount),
                category,
                item or "",
                ctype or "",
                tx.description or "",
                (tx.notes or "").replace("\r", " ").replace("\n", " "),
                member,
            ]
        )
    # BOM: sin él, Excel no reconoce los acentos del UTF-8.
    return "﻿" + buffer.getvalue()
