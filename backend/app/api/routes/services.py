"""Servicios (los administra el admin) y sus vencimientos (los paga cualquier integrante)."""

import uuid
from datetime import date

from fastapi import APIRouter, File, Query, Request, UploadFile, status

from app.api.deps import AdminAuth, CurrentAuth, DbSession, StorageDep
from app.core.config import get_settings
from app.core.errors import PermissionDeniedError, ValidationError
from app.models.enums import UserRole
from app.schemas.service import (
    Alerts,
    PayInput,
    PeriodDetail,
    PeriodOut,
    PeriodStatus,
    PeriodUpdate,
    ServiceInput,
    ServiceOut,
    UnpayInput,
)
from app.schemas.transaction import AttachmentOut, TransactionOut
from app.services import attachments as attachments_service
from app.services import recurring

services_router = APIRouter(prefix="/services", tags=["services"])
periods_router = APIRouter(prefix="/service-periods", tags=["services"])

# Un pedido de calendario abarca como máximo poco más de un año.
MAX_RANGE_DAYS = 400


# --- Servicios -----------------------------------------------------------------------------


@services_router.get("")
def list_services(
    auth: CurrentAuth, db: DbSession, include_inactive: bool = Query(False)
) -> list[ServiceOut]:
    if include_inactive and auth.user.role != UserRole.ADMIN:
        raise PermissionDeniedError("Solo un administrador puede ver los servicios desactivados.")
    return recurring.list_services(db, auth.user.household_id, include_inactive)


@services_router.post("", status_code=status.HTTP_201_CREATED)
def create_service(body: ServiceInput, auth: AdminAuth, db: DbSession) -> ServiceOut:
    service = recurring.create_service(db, auth.user, body)
    return recurring.get_service_out(db, auth.user.household_id, service.id)


@services_router.get("/{service_id}")
def get_service(service_id: uuid.UUID, auth: CurrentAuth, db: DbSession) -> ServiceOut:
    return recurring.get_service_out(db, auth.user.household_id, service_id)


@services_router.put("/{service_id}")
def update_service(
    service_id: uuid.UUID, body: ServiceInput, auth: AdminAuth, db: DbSession
) -> ServiceOut:
    recurring.update_service(db, auth.user, service_id, body)
    return recurring.get_service_out(db, auth.user.household_id, service_id)


@services_router.get("/{service_id}/periods")
def service_history(service_id: uuid.UUID, auth: CurrentAuth, db: DbSession) -> list[PeriodOut]:
    """Historial de vencimientos del servicio, del más reciente al más antiguo."""
    return recurring.service_history(db, auth.user.household_id, service_id)


# --- Vencimientos --------------------------------------------------------------------------


@periods_router.get("")
def list_periods(
    auth: CurrentAuth,
    db: DbSession,
    date_from: date,
    date_to: date,
    status: PeriodStatus | None = None,
) -> list[PeriodOut]:
    if date_to < date_from:
        raise ValidationError("La fecha final es anterior a la inicial.")
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise ValidationError("Elegí un rango de hasta un año.")
    return recurring.list_periods(
        db, auth.user.household_id, date_from=date_from, date_to=date_to, status=status
    )


@periods_router.get("/alerts")
def get_alerts(auth: CurrentAuth, db: DbSession, days: int = Query(7, ge=0, le=60)) -> Alerts:
    overdue, due_soon, items = recurring.alerts(db, auth.user.household_id, days)
    return Alerts(overdue=overdue, due_soon=due_soon, days=days, items=items)


def _detail(db: DbSession, auth: CurrentAuth, period_id: uuid.UUID) -> PeriodDetail:
    out = recurring.get_period_out(db, auth.user.household_id, period_id)
    return PeriodDetail(
        **out.model_dump(),
        attachments=[
            AttachmentOut.model_validate(a)
            for a in recurring.list_period_attachments(db, period_id)
        ],
    )


@periods_router.get("/{period_id}")
def get_period(period_id: uuid.UUID, auth: CurrentAuth, db: DbSession) -> PeriodDetail:
    return _detail(db, auth, period_id)


@periods_router.patch("/{period_id}")
def update_period(
    period_id: uuid.UUID, body: PeriodUpdate, auth: CurrentAuth, db: DbSession
) -> PeriodDetail:
    recurring.update_period(db, auth.user, period_id, body.changes())
    return _detail(db, auth, period_id)


@periods_router.post("/{period_id}/pay")
def pay_period(
    period_id: uuid.UUID, body: PayInput, auth: CurrentAuth, db: DbSession
) -> PeriodDetail:
    recurring.pay_period(db, auth.user, period_id, body)
    return _detail(db, auth, period_id)


@periods_router.post("/{period_id}/unpay")
def unpay_period(
    period_id: uuid.UUID,
    body: UnpayInput,
    auth: CurrentAuth,
    db: DbSession,
    storage: StorageDep,
) -> PeriodDetail:
    recurring.unpay_period(db, auth.user, period_id, body.delete_payment, storage)
    return _detail(db, auth, period_id)


@periods_router.get("/{period_id}/candidates")
def link_candidates(period_id: uuid.UUID, auth: CurrentAuth, db: DbSession) -> list[TransactionOut]:
    """Pagos ya registrados que podrían corresponder a este vencimiento."""
    return recurring.link_candidates(db, auth.user, period_id)


@periods_router.post("/{period_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_period_attachment(
    period_id: uuid.UUID,
    auth: CurrentAuth,
    request: Request,
    db: DbSession,
    storage: StorageDep,
    file: UploadFile = File(...),
) -> AttachmentOut:
    max_bytes = get_settings().max_upload_bytes
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes + 64 * 1024:
        raise ValidationError(f"El archivo supera el máximo de {max_bytes // (1024 * 1024)} MB.")
    period = recurring.get_period(db, auth.user.household_id, period_id)
    data = file.file.read(max_bytes + 1)
    attachment = attachments_service.add_to_period(
        db, auth.user, storage, period, file.filename, data, max_bytes
    )
    return AttachmentOut.model_validate(attachment)
