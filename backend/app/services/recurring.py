"""Servicios recurrentes y sus vencimientos (períodos).

- Los vencimientos se generan a demanda (al consultar el calendario) hasta la fecha pedida.
  La restricción única (servicio, fecha) + INSERT … ON CONFLICT DO NOTHING garantiza que no se
  dupliquen aunque dos personas abran el calendario al mismo tiempo.
- Cada período guarda su importe: cambiar el del servicio no altera los períodos pasados.
- "Vencido" no se guarda: es un período pendiente cuya fecha ya pasó.
- Pagar un período registra (o vincula) un pago en Pagos: el gasto existe una sola vez.
"""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, aliased

from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.models import (
    Attachment,
    Category,
    CategoryItem,
    CategoryType,
    Household,
    Service,
    ServicePayment,
    Transaction,
    User,
)
from app.models.enums import AmountType, ServicePaymentStatus, TransactionStatus, UserRole
from app.schemas.service import (
    PayInput,
    PeriodBrief,
    PeriodOut,
    PeriodServiceRef,
    ServiceInput,
    ServiceOut,
)
from app.schemas.transaction import NamedRef, UserRef
from app.services import audit, catalog
from app.services import transactions as transactions_service
from app.services.schedule import due_dates_until
from app.storage import Storage

# Hasta dónde se generan vencimientos como máximo (evita pedidos absurdos).
MAX_HORIZON_DAYS = 2 * 366
# Por defecto, el calendario siempre tiene generados los próximos 60 días.
DEFAULT_HORIZON_DAYS = 60
# Ventana para sugerir pagos ya registrados que podrían corresponder a un vencimiento.
LINK_WINDOW_DAYS = 45


def _today() -> date:
    return date.today()


def period_status(period: ServicePayment, today: date | None = None) -> str:
    if period.status == ServicePaymentStatus.PAID:
        return "paid"
    return "overdue" if period.due_date < (today or _today()) else "pending"


# --- Generación de vencimientos ------------------------------------------------------------


def ensure_periods(db: Session, household_id: uuid.UUID, until: date) -> None:
    """Crea los vencimientos que falten hasta `until` para los servicios activos del hogar.

    Solo genera las fechas posteriores al último vencimiento ya creado de cada servicio: en la
    consulta habitual del calendario no hay nada nuevo y no se escribe en la base.
    """
    until = min(until, _today() + timedelta(days=MAX_HORIZON_DAYS))
    last_due = (
        select(ServicePayment.service_id, func.max(ServicePayment.due_date).label("last_due"))
        .where(ServicePayment.household_id == household_id)
        .group_by(ServicePayment.service_id)
        .subquery()
    )
    services = db.execute(
        select(Service, last_due.c.last_due)
        .outerjoin(last_due, last_due.c.service_id == Service.id)
        .where(
            Service.household_id == household_id,
            Service.is_active,
            Service.first_due_date <= until,
            # Si ya está generado hasta `until`, no hace falta mirarlo.
            func.coalesce(last_due.c.last_due, Service.first_due_date - 1) < until,
        )
    ).all()
    rows = [
        {
            "id": uuid.uuid4(),
            "household_id": household_id,
            "service_id": service.id,
            "due_date": due,
            "amount_due": service.estimated_amount,
        }
        for service, generated_until in services
        for due in due_dates_until(service.first_due_date, service.frequency, until)
        if generated_until is None or due > generated_until
    ]
    if rows:
        db.execute(
            insert(ServicePayment)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["service_id", "due_date"])
        )
        db.commit()


def _delete_untouched_future_periods(db: Session, service: Service) -> None:
    """Borra los vencimientos FUTUROS que nadie tocó (pendientes, sin comprobantes ni notas).

    Se usa al cambiar la frecuencia o la fecha, o al desactivar el servicio: esos períodos
    eran solo una proyección y se vuelven a generar con los datos nuevos. Los pasados y los
    que tienen información cargada se conservan siempre.
    """
    has_attachments = (
        select(Attachment.id).where(Attachment.service_payment_id == ServicePayment.id).exists()
    )
    for period in db.scalars(
        select(ServicePayment).where(
            ServicePayment.service_id == service.id,
            ServicePayment.status == ServicePaymentStatus.PENDING,
            ServicePayment.due_date >= _today(),
            ServicePayment.notes.is_(None),
            ~has_attachments,
        )
    ):
        db.delete(period)


# --- Consulta de vencimientos --------------------------------------------------------------

_paid_by = aliased(User)
_attachments_count = (
    select(func.count(Attachment.id))
    .where(Attachment.service_payment_id == ServicePayment.id)
    .correlate(ServicePayment)
    .scalar_subquery()
)


def _periods_query(household_id: uuid.UUID):  # noqa: ANN202
    return (
        select(
            ServicePayment,
            Service,
            Category,
            CategoryType,
            CategoryItem,
            _paid_by,
            _attachments_count,
        )
        .join(Service, Service.id == ServicePayment.service_id)
        .join(Category, Category.id == Service.category_id)
        .outerjoin(CategoryType, CategoryType.id == Service.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Service.item_id)
        .outerjoin(_paid_by, _paid_by.id == ServicePayment.paid_by_id)
        .where(ServicePayment.household_id == household_id)
    )


def _ref(entity: object | None) -> NamedRef | None:
    return NamedRef.model_validate(entity) if entity is not None else None


def _period_out(row: tuple) -> PeriodOut:
    period, service, category, category_type, item, paid_by, attachments_count = row
    return PeriodOut(
        id=period.id,
        service=PeriodServiceRef.model_validate(service, from_attributes=True),
        category=NamedRef.model_validate(category),
        category_type=_ref(category_type),
        item=_ref(item),
        due_date=period.due_date,
        amount_due=period.amount_due,
        currency=service.currency,
        status=period_status(period),
        paid_on=period.paid_on,
        amount_paid=period.amount_paid,
        transaction_id=period.transaction_id,
        paid_by=UserRef.model_validate(paid_by) if paid_by else None,
        notes=period.notes,
        attachments_count=attachments_count,
        updated_at=period.updated_at,
    )


def list_periods(
    db: Session,
    household_id: uuid.UUID,
    *,
    date_from: date,
    date_to: date,
    status: str | None = None,
) -> list[PeriodOut]:
    ensure_periods(db, household_id, max(date_to, _today() + timedelta(days=DEFAULT_HORIZON_DAYS)))
    query = _periods_query(household_id).where(
        ServicePayment.due_date >= date_from, ServicePayment.due_date <= date_to
    )
    today = _today()
    if status == "paid":
        query = query.where(ServicePayment.status == ServicePaymentStatus.PAID)
    elif status in ("pending", "overdue"):
        query = query.where(ServicePayment.status == ServicePaymentStatus.PENDING)
        if status == "overdue":
            query = query.where(ServicePayment.due_date < today)
    rows = db.execute(query.order_by(ServicePayment.due_date, Service.name)).all()
    return [_period_out(tuple(row)) for row in rows]


def alerts(db: Session, household_id: uuid.UUID, days: int = 7) -> tuple[int, int, list[PeriodOut]]:
    """Vencidos (de cualquier fecha) y pendientes de los próximos `days` días."""
    today = _today()
    ensure_periods(db, household_id, today + timedelta(days=DEFAULT_HORIZON_DAYS))
    rows = db.execute(
        _periods_query(household_id)
        .where(
            ServicePayment.status == ServicePaymentStatus.PENDING,
            ServicePayment.due_date <= today + timedelta(days=days),
        )
        .order_by(ServicePayment.due_date, Service.name)
    ).all()
    items = [_period_out(tuple(row)) for row in rows]
    overdue = sum(1 for p in items if p.status == "overdue")
    return overdue, len(items) - overdue, items


def get_period(db: Session, household_id: uuid.UUID, period_id: uuid.UUID) -> ServicePayment:
    """Busca DENTRO del hogar: uno de otro hogar responde igual que uno inexistente."""
    period = db.scalar(
        select(ServicePayment).where(
            ServicePayment.id == period_id, ServicePayment.household_id == household_id
        )
    )
    if period is None:
        raise NotFoundError("Vencimiento no encontrado.")
    return period


def get_period_out(db: Session, household_id: uuid.UUID, period_id: uuid.UUID) -> PeriodOut:
    row = db.execute(
        _periods_query(household_id).where(ServicePayment.id == period_id)
    ).one_or_none()
    if row is None:
        raise NotFoundError("Vencimiento no encontrado.")
    return _period_out(tuple(row))


def list_period_attachments(db: Session, period_id: uuid.UUID) -> list[Attachment]:
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.service_payment_id == period_id)
            .order_by(Attachment.created_at)
        )
    )


# --- Corrección, pago y anulación ----------------------------------------------------------


def update_period(
    db: Session, user: User, period_id: uuid.UUID, changes: dict[str, object]
) -> ServicePayment:
    period = get_period(db, user.household_id, period_id)
    if "amount_due" in changes and changes["amount_due"] != period.amount_due:
        audit.record(
            db,
            "service_period.amount_corrected",
            actor=user,
            entity_type="service_period",
            entity_id=period.id,
            details={"from": str(period.amount_due), "to": str(changes["amount_due"])},
        )
        period.amount_due = changes["amount_due"]  # type: ignore[assignment]
    if "notes" in changes:
        period.notes = changes["notes"] or None  # type: ignore[assignment]
    db.commit()
    return period


def _lock_period(db: Session, household_id: uuid.UUID, period_id: uuid.UUID) -> ServicePayment:
    """Bloquea el período hasta el commit: dos personas no pueden pagarlo (o anularlo) a la vez."""
    period = db.scalar(
        select(ServicePayment)
        .where(ServicePayment.id == period_id, ServicePayment.household_id == household_id)
        .with_for_update()
    )
    if period is None:
        raise NotFoundError("Vencimiento no encontrado.")
    return period


def pay_period(db: Session, user: User, period_id: uuid.UUID, data: PayInput) -> ServicePayment:
    period = _lock_period(db, user.household_id, period_id)
    if period.status == ServicePaymentStatus.PAID:
        raise ConflictError("Este vencimiento ya está pagado.")
    service = db.get(Service, period.service_id)

    if data.mode == "link":
        if data.transaction_id is None:
            raise ValidationError("Elegí el pago que querés vincular.")
        transaction = transactions_service.get_transaction(
            db, user.household_id, data.transaction_id
        )
        if transaction.category_id != service.category_id:
            raise ValidationError("El pago elegido es de otra categoría.")
        already = db.scalar(
            select(ServicePayment.id).where(ServicePayment.transaction_id == transaction.id)
        )
        if already:
            raise ConflictError("Ese pago ya está vinculado a otro vencimiento.")
    else:
        amount = data.amount or period.amount_due
        if amount is None:
            raise ValidationError("Ingresá el importe pagado.")
        paid_on = data.paid_on or _today()
        if paid_on > _today() + timedelta(days=transactions_service.MAX_FUTURE_DAYS):
            raise ValidationError("La fecha de pago no puede ser más de un año en el futuro.")
        household = db.get(Household, user.household_id)
        transaction = Transaction(
            household_id=user.household_id,
            amount=amount,
            currency=household.currency,
            occurred_on=paid_on,
            category_id=service.category_id,
            category_type_id=service.category_type_id,
            item_id=service.item_id,
            description=f"{service.name} · vence {period.due_date:%d/%m/%Y}",
            created_by_id=user.id,
        )
        db.add(transaction)
        db.flush()

    period.status = ServicePaymentStatus.PAID
    period.paid_on = transaction.occurred_on
    period.amount_paid = transaction.amount
    # Un solo importe: el del vencimiento pasa a ser el que efectivamente se pagó.
    period.amount_due = transaction.amount
    period.transaction_id = transaction.id
    period.paid_by_id = user.id
    audit.record(
        db,
        "service_period.paid",
        actor=user,
        entity_type="service_period",
        entity_id=period.id,
        details={
            "service": service.name,
            "due_date": period.due_date.isoformat(),
            "amount": str(transaction.amount),
            "mode": data.mode,
        },
    )
    db.commit()
    return period


def unpay_period(
    db: Session,
    user: User,
    period_id: uuid.UUID,
    delete_payment: bool,
    storage: Storage,
) -> ServicePayment:
    period = _lock_period(db, user.household_id, period_id)
    if period.status != ServicePaymentStatus.PAID:
        raise ConflictError("Este vencimiento no está pagado.")
    if user.role != UserRole.ADMIN and period.paid_by_id != user.id:
        raise PermissionDeniedError(
            "Solo quien registró el pago o un administrador pueden anularlo."
        )

    transaction_id = period.transaction_id
    period.status = ServicePaymentStatus.PENDING
    period.paid_on = None
    period.amount_paid = None
    period.transaction_id = None
    period.paid_by_id = None
    audit.record(
        db,
        "service_period.unpaid",
        actor=user,
        entity_type="service_period",
        entity_id=period.id,
        details={"due_date": period.due_date.isoformat(), "payment_deleted": delete_payment},
    )
    db.commit()
    if delete_payment and transaction_id:
        # Ya desvinculado, el pago se elimina con las mismas reglas que desde Pagos.
        transactions_service.delete_transaction(db, user, transaction_id, storage, None)
    return period


def link_candidates(db: Session, user: User, period_id: uuid.UUID) -> list:
    """Pagos ya registrados que podrían corresponder a este vencimiento (para vincular)."""
    period = get_period(db, user.household_id, period_id)
    service = db.get(Service, period.service_id)
    linked = (
        select(ServicePayment.id).where(ServicePayment.transaction_id == Transaction.id).exists()
    )
    conditions = [
        Transaction.category_id == service.category_id,
        Transaction.occurred_on >= period.due_date - timedelta(days=LINK_WINDOW_DAYS),
        Transaction.occurred_on <= period.due_date + timedelta(days=LINK_WINDOW_DAYS),
        Transaction.status == TransactionStatus.CONFIRMED,
        ~linked,
    ]
    if service.category_type_id:
        conditions.append(Transaction.category_type_id == service.category_type_id)
    if service.item_id:
        conditions.append(Transaction.item_id == service.item_id)
    return transactions_service.list_where(db, user, and_(*conditions), limit=10)


# --- Servicios -----------------------------------------------------------------------------


def _get_service(db: Session, household_id: uuid.UUID, service_id: uuid.UUID) -> Service:
    service = db.scalar(
        select(Service).where(Service.id == service_id, Service.household_id == household_id)
    )
    if service is None:
        raise NotFoundError("Servicio no encontrado.")
    return service


def _validate_service(
    db: Session, household_id: uuid.UUID, data: ServiceInput, previous: Service | None
) -> None:
    catalog.validate_category_path(
        db,
        household_id,
        category_id=data.category_id,
        item_id=data.item_id,
        category_type_id=data.category_type_id,
        previous=previous,
    )
    if data.amount_type == AmountType.FIXED and data.estimated_amount is None:
        raise ValidationError("Un servicio de importe fijo necesita el importe.")
    # Un único vencimiento programado por tipo (y elemento): la base también lo garantiza.
    duplicate = select(Service.id).where(
        Service.household_id == household_id,
        Service.category_id == data.category_id,
        Service.category_type_id.is_not_distinct_from(data.category_type_id),
        Service.item_id.is_not_distinct_from(data.item_id),
    )
    if previous is not None:
        duplicate = duplicate.where(Service.id != previous.id)
    if db.scalar(duplicate):
        raise ConflictError(
            "Ese tipo ya tiene un vencimiento programado: editalo en lugar de crear otro."
        )


@dataclass
class _ServiceRow:
    service: Service
    category: Category
    category_type: CategoryType | None
    item: CategoryItem | None


def list_services(
    db: Session, household_id: uuid.UUID, include_inactive: bool = False
) -> list[ServiceOut]:
    ensure_periods(db, household_id, _today() + timedelta(days=DEFAULT_HORIZON_DAYS))
    query = (
        select(Service, Category, CategoryType, CategoryItem)
        .join(Category, Category.id == Service.category_id)
        .outerjoin(CategoryType, CategoryType.id == Service.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Service.item_id)
        .where(Service.household_id == household_id)
    )
    if not include_inactive:
        query = query.where(Service.is_active)
    rows = [_ServiceRow(*row) for row in db.execute(query.order_by(func.lower(Service.name)))]

    # Próximo vencimiento sin pagar de cada servicio (en una sola consulta).
    next_periods: dict[uuid.UUID, ServicePayment] = {}
    for period in db.scalars(
        select(ServicePayment)
        .where(
            ServicePayment.household_id == household_id,
            ServicePayment.status == ServicePaymentStatus.PENDING,
        )
        .order_by(ServicePayment.service_id, ServicePayment.due_date)
        .distinct(ServicePayment.service_id)
    ):
        next_periods[period.service_id] = period

    return [_service_out(r, next_periods.get(r.service.id)) for r in rows]


def _service_out(row: _ServiceRow, next_period: ServicePayment | None) -> ServiceOut:
    s = row.service
    return ServiceOut(
        id=s.id,
        name=s.name,
        provider=s.provider,
        description=s.description,
        category=NamedRef.model_validate(row.category),
        category_type=_ref(row.category_type),
        item=_ref(row.item),
        amount_type=s.amount_type,
        estimated_amount=s.estimated_amount,
        currency=s.currency,
        frequency=s.frequency,
        first_due_date=s.first_due_date,
        is_active=s.is_active,
        notes=s.notes,
        next_period=PeriodBrief(
            id=next_period.id,
            due_date=next_period.due_date,
            amount_due=next_period.amount_due,
            status=period_status(next_period),  # type: ignore[arg-type]
        )
        if next_period
        else None,
    )


def get_service_out(db: Session, household_id: uuid.UUID, service_id: uuid.UUID) -> ServiceOut:
    for service in list_services(db, household_id, include_inactive=True):
        if service.id == service_id:
            return service
    raise NotFoundError("Servicio no encontrado.")


def service_history(db: Session, household_id: uuid.UUID, service_id: uuid.UUID) -> list[PeriodOut]:
    """Todos los vencimientos generados del servicio, del más reciente al más antiguo."""
    _get_service(db, household_id, service_id)
    rows = db.execute(
        _periods_query(household_id)
        .where(ServicePayment.service_id == service_id)
        .order_by(ServicePayment.due_date.desc())
    ).all()
    return [_period_out(tuple(row)) for row in rows]


def create_service(db: Session, admin: User, data: ServiceInput) -> Service:
    _validate_service(db, admin.household_id, data, previous=None)
    household = db.get(Household, admin.household_id)
    service = Service(
        household_id=admin.household_id,
        currency=household.currency,
        created_by_id=admin.id,
        **_service_fields(data),
    )
    db.add(service)
    db.flush()
    audit.record(
        db,
        "service.created",
        actor=admin,
        entity_type="service",
        entity_id=service.id,
        details={"name": service.name, "frequency": service.frequency.value},
    )
    db.commit()
    return service


def _service_fields(data: ServiceInput) -> dict[str, object]:
    return {
        "name": data.name,
        "provider": data.provider or None,
        "description": data.description or None,
        "category_id": data.category_id,
        "category_type_id": data.category_type_id,
        "item_id": data.item_id,
        "amount_type": data.amount_type,
        # Un servicio variable puede no tener importe estimado.
        "estimated_amount": data.estimated_amount,
        "frequency": data.frequency,
        "first_due_date": data.first_due_date,
        "notes": data.notes or None,
        "is_active": data.is_active,
    }


def update_service(db: Session, admin: User, service_id: uuid.UUID, data: ServiceInput) -> Service:
    service = _get_service(db, admin.household_id, service_id)
    _validate_service(db, admin.household_id, data, previous=service)

    old_amount = service.estimated_amount
    schedule_changed = (
        data.frequency != service.frequency or data.first_due_date != service.first_due_date
    )
    deactivated = service.is_active and not data.is_active

    for field, value in _service_fields(data).items():
        setattr(service, field, value)

    if schedule_changed or deactivated:
        # Las proyecciones futuras se rehacen con los datos nuevos (o se quitan si se desactivó).
        _delete_untouched_future_periods(db, service)
    elif data.estimated_amount != old_amount:
        # Nuevo importe: se aplica a los vencimientos FUTUROS pendientes que todavía tenían el
        # importe anterior. Los pasados y los corregidos a mano no cambian.
        for period in db.scalars(
            select(ServicePayment).where(
                ServicePayment.service_id == service.id,
                ServicePayment.status == ServicePaymentStatus.PENDING,
                ServicePayment.due_date >= _today(),
                ServicePayment.amount_due.is_not_distinct_from(old_amount),
            )
        ):
            period.amount_due = data.estimated_amount

    audit.record(
        db,
        "service.updated",
        actor=admin,
        entity_type="service",
        entity_id=service.id,
        details={"name": service.name, "is_active": service.is_active},
    )
    db.commit()
    return service
