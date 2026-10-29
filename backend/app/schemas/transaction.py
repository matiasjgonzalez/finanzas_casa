import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# Importe: positivo, hasta 12 dígitos enteros y 2 decimales. Llega como texto ("1234.50") para
# no perder precisión; Decimal nunca redondea como float.
Amount = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class TransactionInput(BaseModel):
    """Datos de un pago que envía el formulario (alta y edición)."""

    amount: Amount
    occurred_on: date = Field(description="Fecha de pago")
    category_id: uuid.UUID
    category_type_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None
    description: Description | None = None
    notes: Notes | None = None


class NamedRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class TransactionOut(BaseModel):
    id: uuid.UUID
    amount: Decimal
    currency: str
    occurred_on: date
    category: NamedRef
    category_type: NamedRef | None
    item: NamedRef | None
    description: str | None
    notes: str | None
    created_by: UserRef
    attachments_count: int
    # Si este pago cancela un vencimiento de servicio, su id (para mostrarlo y enlazarlo).
    service_period_id: uuid.UUID | None = None
    # Calculado en el backend según los permisos de quien consulta (el frontend solo lo muestra).
    can_edit: bool
    created_at: datetime
    updated_at: datetime


class TransactionDetail(TransactionOut):
    attachments: list[AttachmentOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    # Suma de TODOS los pagos filtrados (no solo de esta página), calculada en PostgreSQL.
    total_amount: Decimal


SortField = Literal["date", "amount", "description", "created"]
SortOrder = Literal["asc", "desc"]
