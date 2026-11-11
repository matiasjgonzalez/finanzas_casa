"""Comprobantes adjuntos a pagos y a vencimientos de servicios."""

import hashlib
import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.models import Attachment, ServicePayment, Transaction, User
from app.models.enums import UserRole
from app.services import audit
from app.services.files import safe_display_name, validate_upload
from app.services.transactions import can_edit, can_view, get_transaction
from app.storage import Storage

logger = logging.getLogger(__name__)

# Máximo de comprobantes por pago o por vencimiento.
MAX_ATTACHMENTS = 10


def _store(
    db: Session,
    user: User,
    storage: Storage,
    owner: dict[str, uuid.UUID],
    filename: str | None,
    data: bytes,
    max_bytes: int,
) -> Attachment:
    """Valida, guarda el archivo y registra el comprobante para su dueño (pago o vencimiento)."""
    owner_column, owner_id = next(iter(owner.items()))
    count = db.scalar(
        select(func.count())
        .select_from(Attachment)
        .where(getattr(Attachment, owner_column) == owner_id)
    )
    if count >= MAX_ATTACHMENTS:
        raise ValidationError(f"Se pueden adjuntar como máximo {MAX_ATTACHMENTS} comprobantes.")

    content_type, extension = validate_upload(filename, data, max_bytes)
    # Nombre físico generado por el servidor; el nombre original se guarda solo para mostrarlo.
    key = f"{user.household_id}/{uuid.uuid4().hex}.{extension}"
    storage.save(key, data)
    attachment = Attachment(
        household_id=user.household_id,
        **owner,
        storage_key=key,
        original_filename=safe_display_name(filename),
        content_type=content_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    try:
        db.commit()
    except Exception:
        # Si no se pudo registrar en la base, el archivo no debe quedar huérfano.
        db.rollback()
        storage.delete(key)
        raise
    return attachment


def add_to_transaction(
    db: Session,
    user: User,
    storage: Storage,
    transaction_id: uuid.UUID,
    filename: str | None,
    data: bytes,
    max_bytes: int,
) -> Attachment:
    transaction = get_transaction(db, user.household_id, transaction_id, user)
    if not can_edit(user, transaction):
        raise PermissionDeniedError(
            "Solo quien registró el pago o un administrador pueden adjuntar comprobantes."
        )
    return _store(db, user, storage, {"transaction_id": transaction.id}, filename, data, max_bytes)


def add_to_period(
    db: Session,
    user: User,
    storage: Storage,
    period: ServicePayment,
    filename: str | None,
    data: bytes,
    max_bytes: int,
) -> Attachment:
    """Comprobante de un vencimiento (factura, ticket…). Cualquier integrante puede adjuntarlo."""
    return _store(db, user, storage, {"service_payment_id": period.id}, filename, data, max_bytes)


def get_attachment(db: Session, user: User, attachment_id: uuid.UUID) -> Attachment:
    """Busca DENTRO del hogar: uno de otro hogar responde igual que uno inexistente. El de un
    pago que la persona no puede ver (lo cargó otro integrante) también."""
    attachment = db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id, Attachment.household_id == user.household_id
        )
    )
    if attachment is not None and attachment.transaction_id is not None:
        transaction = db.get(Transaction, attachment.transaction_id)
        if transaction is None or not can_view(user, transaction):
            attachment = None
    if attachment is None:
        raise NotFoundError("Comprobante no encontrado.")
    return attachment


def delete_attachment(
    db: Session, user: User, storage: Storage, attachment_id: uuid.UUID, ip_address: str | None
) -> None:
    attachment = get_attachment(db, user, attachment_id)
    transaction = (
        db.get(Transaction, attachment.transaction_id) if attachment.transaction_id else None
    )
    # Puede borrarlo quien lo subió, un administrador o quien puede editar el pago.
    allowed = (
        attachment.uploaded_by_id == user.id
        or user.role == UserRole.ADMIN
        or (transaction is not None and can_edit(user, transaction))
    )
    if not allowed:
        raise PermissionDeniedError("No podés eliminar este comprobante.")

    key = attachment.storage_key
    audit.record(
        db,
        "attachment.deleted",
        actor=user,
        entity_type="attachment",
        entity_id=attachment.id,
        details={"filename": attachment.original_filename},
        ip_address=ip_address,
    )
    db.delete(attachment)
    db.commit()
    storage.delete(key)
