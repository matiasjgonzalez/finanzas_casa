"""Informes, resumen de Inicio y presupuestos.

Cada informe cuenta, por defecto, los gastos de quien consulta (`scope=mine`); con
`scope=household`, los de todo el hogar, solo para un administrador. Los presupuestos son del
hogar: los consulta y los fija un administrador."""

import re
import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, BeforeValidator

from app.api.deps import AdminAuth, CurrentAuth, DbSession
from app.core import clock
from app.core.errors import ValidationError
from app.schemas.transaction import Amount
from app.services import budgets as budgets_service
from app.services import insights
from app.services import reports as reports_service
from app.services.budgets import BudgetMonth, BudgetOut
from app.services.insights import Projection, Punctuality
from app.services.reports import (
    DayTotal,
    Group,
    GroupTotal,
    MonthGroups,
    MonthTotal,
    Patterns,
    Spending,
    Summary,
)
from app.services.transactions import Scope, owner_for

reports_router = APIRouter(prefix="/reports", tags=["reports"])
budgets_router = APIRouter(prefix="/budgets", tags=["budgets"])

_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def _parse_month(value: object) -> object:
    """'2026-10' → date(2026, 10, 1)."""
    if isinstance(value, str):
        match = _MONTH.match(value)
        if not match:
            raise ValueError("Usá el formato AAAA-MM (ej. 2026-10).")
        return date(int(match[1]), int(match[2]), 1)
    return value


Month = Annotated[date, BeforeValidator(_parse_month)]


def _month_param(month: str | None) -> date:
    if month is None:
        return clock.today().replace(day=1)
    try:
        return _parse_month(month)  # type: ignore[return-value]
    except ValueError as error:
        raise ValidationError(str(error)) from error


def _check_range(date_from: date | None, date_to: date | None) -> None:
    if date_from and date_to and date_from > date_to:
        raise ValidationError("La fecha «desde» no puede ser posterior a la fecha «hasta».")


@reports_router.get("/summary")
def summary(
    auth: CurrentAuth, db: DbSession, month: str | None = None, scope: Scope = "mine"
) -> Summary:
    """Resumen de Inicio: total del mes, del mes anterior y gasto por categoría."""
    return reports_service.summary(
        db, auth.user.household_id, _month_param(month), owner_for(auth.user, scope)
    )


@reports_router.get("/spending")
def spending(
    auth: CurrentAuth,
    db: DbSession,
    month: str | None = None,
    year: int | None = Query(None, ge=2000, le=2100),
    scope: Scope = "mine",
) -> Spending:
    """ "Cuánto gastamos": total, comparación, los 12 meses del gráfico y el detalle completo
    (categoría → tipo, o categoría → elemento → tipo) de un mes o, con `year`, de un año."""
    if year is not None and month is not None:
        raise ValidationError("Indicá un mes o un año, no los dos.")
    owner_id = owner_for(auth.user, scope)
    if year is not None:
        return reports_service.spending(db, auth.user.household_id, year=year, owner_id=owner_id)
    return reports_service.spending(
        db, auth.user.household_id, month=_month_param(month), owner_id=owner_id
    )


@reports_router.get("/monthly")
def monthly(
    auth: CurrentAuth,
    db: DbSession,
    until: str | None = None,
    months: int = Query(12, ge=1, le=36),
    category_id: uuid.UUID | None = None,
    category_type_id: uuid.UUID | None = None,
    item_id: uuid.UUID | None = None,
    scope: Scope = "mine",
) -> list[MonthTotal]:
    """Evolución: total de cada mes (los últimos `months`, terminando en `until`). Se puede
    acotar a una categoría, un tipo (ej. Luz) o un elemento (ej. un auto)."""
    return reports_service.monthly(
        db,
        auth.user.household_id,
        until=_month_param(until),
        months=months,
        category_id=category_id,
        category_type_id=category_type_id,
        item_id=item_id,
        owner_id=owner_for(auth.user, scope),
    )


@reports_router.get("/monthly-grouped")
def monthly_grouped(
    auth: CurrentAuth,
    db: DbSession,
    group: Literal["category", "type", "item"] = "category",
    until: str | None = None,
    months: int = Query(12, ge=1, le=36),
    category_id: uuid.UUID | None = None,
    scope: Scope = "mine",
) -> list[MonthGroups]:
    """Evolución desglosada por categoría (o por tipo / elemento de una categoría)."""
    return reports_service.monthly_grouped(
        db,
        auth.user.household_id,
        group=group,
        until=_month_param(until),
        months=months,
        category_id=category_id,
        owner_id=owner_for(auth.user, scope),
    )


@reports_router.get("/daily")
def daily(
    auth: CurrentAuth, db: DbSession, month: str | None = None, scope: Scope = "mine"
) -> list[DayTotal]:
    """Total de cada día del mes (para el gasto acumulado)."""
    start = _month_param(month)
    return reports_service.daily(
        db,
        auth.user.household_id,
        start,
        reports_service.month_end(start),
        owner_for(auth.user, scope),
    )


@reports_router.get("/patterns")
def patterns(
    auth: CurrentAuth,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    scope: Scope = "mine",
) -> Patterns:
    """Gasto por día de la semana y por día del mes."""
    _check_range(date_from, date_to)
    return reports_service.patterns(
        db, auth.user.household_id, date_from, date_to, owner_for(auth.user, scope)
    )


@reports_router.get("/punctuality")
def punctuality(
    auth: CurrentAuth,
    db: DbSession,
    until: str | None = None,
    months: int = Query(6, ge=1, le=36),
) -> Punctuality:
    """Vencimientos pagados a tiempo, tarde o vencidos, por mes y por servicio."""
    return insights.punctuality(
        db, auth.user.household_id, until=_month_param(until), months=months
    )


@reports_router.get("/projection")
def projection(
    auth: CurrentAuth, db: DbSession, month: str | None = None, scope: Scope = "mine"
) -> Projection:
    """Lo gastado en el mes más los vencimientos que faltan pagar."""
    return insights.projection(
        db, auth.user.household_id, _month_param(month), owner_for(auth.user, scope)
    )


@reports_router.get("/breakdown")
def breakdown(
    auth: CurrentAuth,
    db: DbSession,
    group: Group = "category",
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: uuid.UUID | None = None,
    scope: Scope = "mine",
) -> list[GroupTotal]:
    """Distribución del gasto por categoría, tipo, elemento (ej. auto) o integrante."""
    _check_range(date_from, date_to)
    return reports_service.breakdown(
        db,
        auth.user.household_id,
        group=group,
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
        owner_id=owner_for(auth.user, scope),
    )


@reports_router.get("/export.csv")
def export_csv(
    auth: CurrentAuth,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    scope: Scope = "mine",
) -> Response:
    """Pagos del período en CSV (se abre con Excel)."""
    _check_range(date_from, date_to)
    content = reports_service.export_csv(
        db, auth.user.household_id, date_from, date_to, owner_for(auth.user, scope)
    )
    name = f"pagos_{date_from or 'inicio'}_{date_to or 'hoy'}.csv"
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


class BudgetInput(BaseModel):
    month: Month
    # None: quitar el presupuesto desde ese mes.
    amount: Amount | None


@budgets_router.get("")
def list_budgets(auth: AdminAuth, db: DbSession, month: str | None = None) -> list[BudgetOut]:
    return budgets_service.list_for_month(db, auth.user.household_id, _month_param(month))


@budgets_router.get("/{category_id}/history")
def budget_history(
    category_id: uuid.UUID,
    auth: AdminAuth,
    db: DbSession,
    until: str | None = None,
    months: int = Query(12, ge=1, le=36),
) -> list[BudgetMonth]:
    """Presupuesto contra gastado de una categoría, mes a mes."""
    return budgets_service.history(
        db, auth.user.household_id, category_id, until=_month_param(until), months=months
    )


@budgets_router.put("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def set_budget(category_id: uuid.UUID, body: BudgetInput, auth: AdminAuth, db: DbSession) -> None:
    budgets_service.set_budget(db, auth.user, category_id, body.month, body.amount)
