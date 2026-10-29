"""Informes sobre los vencimientos: puntualidad de los pagos y proyección del mes."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Service, ServicePayment
from app.models.enums import ServicePaymentStatus
from app.services import recurring, reports
from app.services.reports import add_months, month_end, month_start

PAID = ServicePaymentStatus.PAID
PENDING = ServicePaymentStatus.PENDING


class PunctualityCounts(BaseModel):
    on_time: int  # pagado hasta el día del vencimiento
    late: int  # pagado después del vencimiento
    overdue: int  # sin pagar y con la fecha ya pasada


class PunctualityMonth(PunctualityCounts):
    month: date


class PunctualityService(PunctualityCounts):
    id: uuid.UUID
    name: str


class Punctuality(BaseModel):
    months: list[PunctualityMonth]
    services: list[PunctualityService]


def _counts():  # noqa: ANN202
    today = recurring._today()
    return (
        func.count().filter(
            ServicePayment.status == PAID, ServicePayment.paid_on <= ServicePayment.due_date
        ),
        func.count().filter(
            ServicePayment.status == PAID, ServicePayment.paid_on > ServicePayment.due_date
        ),
        func.count().filter(ServicePayment.status == PENDING, ServicePayment.due_date < today),
    )


def punctuality(
    db: Session, household_id: uuid.UUID, *, until: date, months: int = 12
) -> Punctuality:
    """Cuántos vencimientos se pagaron a tiempo, tarde o siguen vencidos (los que vencen en
    el futuro todavía no cuentan)."""
    last = month_start(until)
    first = add_months(last, -(months - 1))
    end = min(month_end(last), recurring._today() - timedelta(days=1))
    scope = (
        ServicePayment.household_id == household_id,
        ServicePayment.due_date.between(first, end),
    )
    bucket = func.date_trunc("month", ServicePayment.due_date)
    by_month = {
        row[0].date(): row[1:]
        for row in db.execute(select(bucket, *_counts()).where(*scope).group_by(bucket))
    }
    result_months = []
    for i in range(months):
        month = add_months(first, i)
        on_time, late, overdue = by_month.get(month, (0, 0, 0))
        result_months.append(
            PunctualityMonth(month=month, on_time=on_time, late=late, overdue=overdue)
        )
    services = [
        PunctualityService(id=sid, name=name, on_time=a, late=b, overdue=c)
        for sid, name, a, b, c in db.execute(
            select(Service.id, Service.name, *_counts())
            .join(ServicePayment, ServicePayment.service_id == Service.id)
            .where(*scope)
            .group_by(Service.id, Service.name)
        )
    ]
    # Primero los que más se atrasan.
    services.sort(key=lambda s: (-(s.overdue + s.late), s.name.lower()))
    return Punctuality(months=result_months, services=services)


class Projection(BaseModel):
    month: date
    spent: Decimal  # pagos ya cargados en el mes
    pending: Decimal  # vencimientos del mes sin pagar, con importe conocido
    pending_count: int
    # Vencimientos sin pagar de importe variable todavía sin definir (no se pueden sumar).
    unknown_count: int
    projected: Decimal


def projection(db: Session, household_id: uuid.UUID, month: date) -> Projection:
    """Cuánto se va a terminar gastando en el mes: lo pagado más lo que falta vencer."""
    month = month_start(month)
    recurring.ensure_periods(db, household_id, month_end(month))
    spent = reports.summary(db, household_id, month).total
    pending, count, unknown = db.execute(
        select(
            func.coalesce(func.sum(ServicePayment.amount_due), 0),
            func.count(ServicePayment.amount_due),
            func.count().filter(ServicePayment.amount_due.is_(None)),
        ).where(
            ServicePayment.household_id == household_id,
            ServicePayment.status == PENDING,
            ServicePayment.due_date.between(month, month_end(month)),
        )
    ).one()
    return Projection(
        month=month,
        spent=spent,
        pending=Decimal(pending),
        pending_count=count,
        unknown_count=unknown,
        projected=spent + Decimal(pending),
    )
