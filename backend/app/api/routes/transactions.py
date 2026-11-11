import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, File, Query, Request, UploadFile, status

from app.api.deps import CurrentAuth, DbSession, StorageDep, client_ip
from app.core.config import get_settings
from app.core.errors import ValidationError
from app.schemas.transaction import (
    AttachmentOut,
    SortField,
    SortOrder,
    TransactionDetail,
    TransactionInput,
    TransactionOut,
    TransactionPage,
)
from app.services import attachments as attachments_service
from app.services import transactions as transactions_service
from app.services.transactions import Scope, TransactionFilters, owner_for

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    auth: CurrentAuth,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: uuid.UUID | None = None,
    category_type_id: uuid.UUID | None = None,
    item_id: uuid.UUID | None = None,
    created_by_id: uuid.UUID | None = None,
    amount_min: Decimal | None = Query(None, ge=0),
    amount_max: Decimal | None = Query(None, ge=0),
    q: str | None = Query(
        None, max_length=100, description="Busca en descripción, notas, categoría, tipo y elemento"
    ),
    sort: SortField = "date",
    order: SortOrder = "desc",
    page: int = Query(1, ge=1),
    # Hasta 500 para el calendario de pagos realizados (un mes completo en una consulta).
    page_size: int = Query(25, ge=1, le=500),
    scope: Scope = "mine",
) -> TransactionPage:
    # "Mis gastos" muestra solo lo propio; en "Gastos del hogar" se puede filtrar por persona.
    owner_id = owner_for(auth.user, scope)
    filters = TransactionFilters(
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
        category_type_id=category_type_id,
        item_id=item_id,
        created_by_id=created_by_id,
        owner_id=owner_id,
        amount_min=amount_min,
        amount_max=amount_max,
        search=q,
    )
    items, total, total_amount = transactions_service.list_transactions(
        db, auth.user, filters, sort=sort, order=order, page=page, page_size=page_size
    )
    return TransactionPage(
        items=items, total=total, page=page, page_size=page_size, total_amount=total_amount
    )


def _detail(db: DbSession, auth: CurrentAuth, transaction_id: uuid.UUID) -> TransactionDetail:
    out = transactions_service.get_transaction_out(db, auth.user, transaction_id)
    attachments = transactions_service.list_attachments(db, transaction_id)
    return TransactionDetail(
        **out.model_dump(), attachments=[AttachmentOut.model_validate(a) for a in attachments]
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_transaction(body: TransactionInput, auth: CurrentAuth, db: DbSession) -> TransactionOut:
    transaction = transactions_service.create_transaction(db, auth.user, body)
    return transactions_service.get_transaction_out(db, auth.user, transaction.id)


@router.get("/{transaction_id}")
def get_transaction(
    transaction_id: uuid.UUID, auth: CurrentAuth, db: DbSession
) -> TransactionDetail:
    return _detail(db, auth, transaction_id)


@router.put("/{transaction_id}")
def update_transaction(
    transaction_id: uuid.UUID, body: TransactionInput, auth: CurrentAuth, db: DbSession
) -> TransactionDetail:
    transactions_service.update_transaction(db, auth.user, transaction_id, body)
    return _detail(db, auth, transaction_id)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: uuid.UUID,
    auth: CurrentAuth,
    request: Request,
    db: DbSession,
    storage: StorageDep,
) -> None:
    transactions_service.delete_transaction(
        db, auth.user, transaction_id, storage, client_ip(request)
    )


@router.post("/{transaction_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(
    transaction_id: uuid.UUID,
    auth: CurrentAuth,
    request: Request,
    db: DbSession,
    storage: StorageDep,
    file: UploadFile = File(...),
) -> AttachmentOut:
    max_bytes = get_settings().max_upload_bytes
    # Rechazo temprano por el tamaño declarado (el margen cubre los encabezados del formulario).
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes + 64 * 1024:
        raise ValidationError(f"El archivo supera el máximo de {max_bytes // (1024 * 1024)} MB.")
    # Se lee como máximo un byte más que el límite: alcanza para saber si lo supera.
    data = file.file.read(max_bytes + 1)
    attachment = attachments_service.add_to_transaction(
        db, auth.user, storage, transaction_id, file.filename, data, max_bytes
    )
    return AttachmentOut.model_validate(attachment)
