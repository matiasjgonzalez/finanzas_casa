"""Pagos del hogar: alta, consulta con filtros, edición y eliminación.

Permisos:
- Todos los integrantes del hogar VEN todos los pagos (la información es compartida).
- Cada persona EDITA y ELIMINA los pagos que registró; el administrador, todos.
"""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core import clock
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.models import (
    Attachment,
    Category,
    CategoryItem,
    CategoryType,
    Household,
    ServicePayment,
    Transaction,
    User,
)
from app.models.enums import CategoryStructure, TransactionStatus, UserRole
from app.schemas.transaction import (
    NamedRef,
    SortField,
    SortOrder,
    TransactionInput,
    TransactionOut,
    UserRef,
)
from app.services import audit, catalog
from app.storage import Storage

# Fechas aceptadas: desde el año 2000 hasta un año hacia adelante (pagos ya programados).
MIN_DATE = date(2000, 1, 1)
MAX_FUTURE_DAYS = 366

USES_TYPES = {CategoryStructure.TYPES, CategoryStructure.ITEMS_AND_TYPES}
USES_ITEMS = {CategoryStructure.ITEMS_AND_TYPES}


@dataclass
class TransactionFilters:
    date_from: date | None = None
    date_to: date | None = None
    category_id: uuid.UUID | None = None
    category_type_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None
    created_by_id: uuid.UUID | None = None
    amount_min: Decimal | None = None
    amount_max: Decimal | None = None
    search: str | None = None


def can_edit(user: User, transaction: Transaction) -> bool:
    return user.role == UserRole.ADMIN or transaction.created_by_id == user.id


# --- Consulta ------------------------------------------------------------------------------

_creator = aliased(User)
_attachments_count = (
    select(func.count(Attachment.id))
    .where(Attachment.transaction_id == Transaction.id)
    .correlate(Transaction)
    .scalar_subquery()
)


# Vencimiento de servicio que este pago cancela (si corresponde a uno).
_service_period_id = (
    select(ServicePayment.id)
    .where(ServicePayment.transaction_id == Transaction.id)
    .correlate(Transaction)
    .scalar_subquery()
)


def _base_query(household_id: uuid.UUID) -> Select:
    return (
        select(
            Transaction,
            Category,
            CategoryType,
            CategoryItem,
            _creator,
            _attachments_count,
            _service_period_id,
        )
        .join(Category, Category.id == Transaction.category_id)
        .join(_creator, _creator.id == Transaction.created_by_id)
        .outerjoin(CategoryType, CategoryType.id == Transaction.category_type_id)
        .outerjoin(CategoryItem, CategoryItem.id == Transaction.item_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.status == TransactionStatus.CONFIRMED,
        )
    )


def _filter_conditions(filters: TransactionFilters) -> list:
    conditions = []
    if filters.date_from:
        conditions.append(Transaction.occurred_on >= filters.date_from)
    if filters.date_to:
        conditions.append(Transaction.occurred_on <= filters.date_to)
    if filters.category_id:
        conditions.append(Transaction.category_id == filters.category_id)
    if filters.category_type_id:
        conditions.append(Transaction.category_type_id == filters.category_type_id)
    if filters.item_id:
        conditions.append(Transaction.item_id == filters.item_id)
    if filters.created_by_id:
        conditions.append(Transaction.created_by_id == filters.created_by_id)
    if filters.amount_min is not None:
        conditions.append(Transaction.amount >= filters.amount_min)
    if filters.amount_max is not None:
        conditions.append(Transaction.amount <= filters.amount_max)
    if filters.search and filters.search.strip():
        # Se escapan % y _ para que se busquen como texto y no como comodines.
        term = filters.search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        # unaccent: la búsqueda no distingue tildes ni mayúsculas ("super" encuentra "Súper").
        # Busca en descripción, observaciones y en los nombres de categoría, tipo y elemento.
        pattern = func.unaccent(f"%{term}%")
        conditions.append(
            or_(
                *(
                    func.unaccent(column).ilike(pattern, escape="\\")
                    for column in (
                        Transaction.description,
                        Transaction.notes,
                        Category.name,
                        CategoryType.name,
                        CategoryItem.name,
                    )
                )
            )
        )
    return conditions


_SORT_COLUMNS = {
    "date": Transaction.occurred_on,
    "amount": Transaction.amount,
    "description": func.lower(func.coalesce(Transaction.description, Category.name)),
    "created": Transaction.created_at,
}


def _ref(entity: object | None) -> NamedRef | None:
    return NamedRef.model_validate(entity) if entity is not None else None


def _to_out(row: tuple, viewer: User) -> TransactionOut:
    transaction, category, category_type, item, creator, attachments_count, period_id = row
    return TransactionOut(
        id=transaction.id,
        amount=transaction.amount,
        currency=transaction.currency,
        occurred_on=transaction.occurred_on,
        category=NamedRef.model_validate(category),
        category_type=_ref(category_type),
        item=_ref(item),
        description=transaction.description,
        notes=transaction.notes,
        created_by=UserRef.model_validate(creator),
        attachments_count=attachments_count,
        service_period_id=period_id,
        can_edit=can_edit(viewer, transaction),
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
    )


def list_transactions(
    db: Session,
    viewer: User,
    filters: TransactionFilters,
    *,
    sort: SortField = "date",
    order: SortOrder = "desc",
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[TransactionOut], int, Decimal]:
    filtered = _base_query(viewer.household_id).where(*_filter_conditions(filters))

    sort_column = _SORT_COLUMNS[sort]
    sort_expr = sort_column.asc() if order == "asc" else sort_column.desc()
    # Orden secundario estable: con la misma fecha, primero lo último cargado.
    rows = db.execute(
        filtered.order_by(sort_expr, Transaction.created_at.desc(), Transaction.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    # Cantidad y suma sobre TODO el conjunto filtrado (no solo esta página).
    subquery = filtered.with_only_columns(Transaction.amount).subquery()
    count, total = db.execute(
        select(func.count(), func.coalesce(func.sum(subquery.c.amount), 0))
    ).one()
    return [_to_out(row, viewer) for row in rows], count, Decimal(total)


def list_where(db: Session, viewer: User, condition: object, *, limit: int) -> list[TransactionOut]:
    """Pagos del hogar que cumplen una condición (la usan otros módulos, ej. vincular servicios)."""
    rows = db.execute(
        _base_query(viewer.household_id)
        .where(condition)
        .order_by(Transaction.occurred_on.desc())
        .limit(limit)
    ).all()
    return [_to_out(row, viewer) for row in rows]


def get_transaction(db: Session, household_id: uuid.UUID, transaction_id: uuid.UUID) -> Transaction:
    """Busca DENTRO del hogar: uno de otro hogar responde igual que uno inexistente."""
    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.household_id == household_id,
            Transaction.status == TransactionStatus.CONFIRMED,
        )
    )
    if transaction is None:
        raise NotFoundError("Pago no encontrado.")
    return transaction


def get_transaction_out(db: Session, viewer: User, transaction_id: uuid.UUID) -> TransactionOut:
    row = db.execute(
        _base_query(viewer.household_id).where(Transaction.id == transaction_id)
    ).one_or_none()
    if row is None:
        raise NotFoundError("Pago no encontrado.")
    return _to_out(tuple(row), viewer)


def list_attachments(db: Session, transaction_id: uuid.UUID) -> list[Attachment]:
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.transaction_id == transaction_id)
            .order_by(Attachment.created_at)
        )
    )


# --- Alta y edición ------------------------------------------------------------------------


def _validate(
    db: Session, household_id: uuid.UUID, data: TransactionInput, previous: Transaction | None
) -> None:
    """Reglas del negocio. Los mensajes se muestran tal cual al usuario."""
    if data.occurred_on < MIN_DATE:
        raise ValidationError("La fecha de pago es demasiado antigua.")
    if data.occurred_on > clock.today() + timedelta(days=MAX_FUTURE_DAYS):
        raise ValidationError("La fecha de pago no puede ser más de un año en el futuro.")

    catalog.validate_category_path(
        db,
        household_id,
        category_id=data.category_id,
        item_id=data.item_id,
        category_type_id=data.category_type_id,
        previous=previous,
    )


def create_transaction(db: Session, user: User, data: TransactionInput) -> Transaction:
    _validate(db, user.household_id, data, previous=None)
    household = db.get(Household, user.household_id)
    transaction = Transaction(
        household_id=user.household_id,
        amount=data.amount,
        currency=household.currency,
        occurred_on=data.occurred_on,
        category_id=data.category_id,
        category_type_id=data.category_type_id,
        item_id=data.item_id,
        description=data.description or None,
        notes=data.notes or None,
        created_by_id=user.id,
    )
    db.add(transaction)
    db.commit()
    return transaction


def _get_editable(db: Session, user: User, transaction_id: uuid.UUID) -> Transaction:
    transaction = get_transaction(db, user.household_id, transaction_id)
    if not can_edit(user, transaction):
        raise PermissionDeniedError(
            "Solo quien registró el pago o un administrador pueden modificarlo."
        )
    return transaction


def update_transaction(
    db: Session, user: User, transaction_id: uuid.UUID, data: TransactionInput
) -> Transaction:
    transaction = _get_editable(db, user, transaction_id)
    _validate(db, user.household_id, data, previous=transaction)
    transaction.amount = data.amount
    transaction.occurred_on = data.occurred_on
    transaction.category_id = data.category_id
    transaction.category_type_id = data.category_type_id
    transaction.item_id = data.item_id
    transaction.description = data.description or None
    transaction.notes = data.notes or None
    transaction.updated_by_id = user.id
    db.commit()
    return transaction


def delete_transaction(
    db: Session, user: User, transaction_id: uuid.UUID, storage: Storage, ip_address: str | None
) -> None:
    transaction = _get_editable(db, user, transaction_id)
    paid_period = db.scalar(
        select(ServicePayment.id).where(ServicePayment.transaction_id == transaction.id)
    )
    if paid_period:
        raise ConflictError(
            "Este pago corresponde a un vencimiento de servicio. "
            "Anulá primero el pago desde el calendario."
        )

    keys = [a.storage_key for a in list_attachments(db, transaction.id)]
    audit.record(
        db,
        "transaction.deleted",
        actor=user,
        entity_type="transaction",
        entity_id=transaction.id,
        details={
            "description": transaction.description,
            "amount": str(transaction.amount),
            "occurred_on": transaction.occurred_on.isoformat(),
            "attachments": len(keys),
        },
        ip_address=ip_address,
    )
    db.delete(
        transaction
    )  # los comprobantes se borran en cascada (clave foránea ON DELETE CASCADE)
    db.commit()
    # Los archivos se borran DESPUÉS del commit: si la base fallara, no se pierden comprobantes.
    for key in keys:
        storage.delete(key)
