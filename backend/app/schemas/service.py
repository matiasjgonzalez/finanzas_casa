import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.models.enums import AmountType, ServiceFrequency
from app.schemas.transaction import Amount, AttachmentOut, NamedRef, UserRef

ServiceName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]

# "Vencido" no se guarda: es un pendiente cuya fecha ya pasó.
PeriodStatus = Literal["pending", "overdue", "paid"]


class ServiceInput(BaseModel):
    """Alta y edición de un servicio (solo administradores)."""

    name: ServiceName
    provider: OptionalText | None = None
    description: OptionalText | None = None
    category_id: uuid.UUID
    category_type_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None
    amount_type: AmountType
    estimated_amount: Amount | None = None
    frequency: ServiceFrequency
    first_due_date: date
    notes: Notes | None = None
    is_active: bool = True


class PeriodBrief(BaseModel):
    id: uuid.UUID
    due_date: date
    amount_due: Decimal | None
    status: PeriodStatus


class ServiceOut(BaseModel):
    id: uuid.UUID
    name: str
    provider: str | None
    description: str | None
    category: NamedRef
    category_type: NamedRef | None
    item: NamedRef | None
    amount_type: AmountType
    estimated_amount: Decimal | None
    currency: str
    frequency: ServiceFrequency
    first_due_date: date
    is_active: bool
    notes: str | None
    # Próximo vencimiento sin pagar (puede estar vencido).
    next_period: PeriodBrief | None


class PeriodServiceRef(BaseModel):
    id: uuid.UUID
    name: str
    provider: str | None
    amount_type: AmountType
    frequency: ServiceFrequency
    is_active: bool


class PeriodOut(BaseModel):
    id: uuid.UUID
    service: PeriodServiceRef
    category: NamedRef
    category_type: NamedRef | None
    item: NamedRef | None
    due_date: date
    amount_due: Decimal | None
    currency: str
    status: PeriodStatus
    paid_on: date | None
    amount_paid: Decimal | None
    transaction_id: uuid.UUID | None
    paid_by: UserRef | None
    notes: str | None
    attachments_count: int
    updated_at: datetime


class PeriodDetail(PeriodOut):
    attachments: list[AttachmentOut]


class PeriodUpdate(BaseModel):
    """Corrección de un período: importe propio (no cambia el del servicio) y notas."""

    amount_due: Amount | None = None
    notes: Notes | None = None

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)


class PayInput(BaseModel):
    """create: registra un pago nuevo en Pagos. link: vincula un pago ya registrado."""

    mode: Literal["create", "link"] = "create"
    paid_on: date | None = None
    amount: Amount | None = None
    transaction_id: uuid.UUID | None = None


class UnpayInput(BaseModel):
    # Al anular, por defecto también se elimina el pago registrado en Pagos.
    delete_payment: bool = True


class Alerts(BaseModel):
    """Recordatorios: vencidos y por vencer en los próximos días."""

    overdue: int
    due_soon: int
    days: int
    items: list[PeriodOut]
