"""Servicios recurrentes del hogar y sus períodos (vencimientos)."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import AmountType, ServiceFrequency, ServicePaymentStatus, str_enum
from app.models.transaction import Money


class Service(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso"),
        CheckConstraint(
            "estimated_amount IS NULL OR estimated_amount > 0", name="estimated_amount_positive"
        ),
        # Un servicio de importe fijo necesita su importe; uno variable puede no tenerlo.
        CheckConstraint(
            "amount_type = 'variable' OR estimated_amount IS NOT NULL",
            name="fixed_requires_amount",
        ),
        # Igual que en los pagos: categoría del hogar, y tipo y elemento de ESA categoría.
        ForeignKeyConstraint(
            ["household_id", "category_id"],
            ["categories.household_id", "categories.id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["category_id", "category_type_id"],
            ["category_types.category_id", "category_types.id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["category_id", "item_id"],
            ["category_items.category_id", "category_items.id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("household_id", "id"),
        # Un único vencimiento programado por lugar del catálogo (ej. Tarjeta → Visa, o
        # Auto → Fiat Cronos → Patente). NULLS NOT DISTINCT: sin elemento también cuenta.
        UniqueConstraint(
            "category_id",
            "category_type_id",
            "item_id",
            name="uq_services_category_path",
            postgresql_nulls_not_distinct=True,
        ),
    )

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(255))
    # Dónde se registra el pago de cada vencimiento (ej. Servicio → Luz).
    category_id: Mapped[uuid.UUID] = mapped_column()
    category_type_id: Mapped[uuid.UUID | None] = mapped_column()
    item_id: Mapped[uuid.UUID | None] = mapped_column()
    amount_type: Mapped[AmountType] = mapped_column(str_enum(AmountType, "amount_type"))
    estimated_amount: Mapped[Decimal | None] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="ARS", server_default="ARS")
    frequency: Mapped[ServiceFrequency] = mapped_column(
        str_enum(ServiceFrequency, "service_frequency")
    )
    # Primer vencimiento: a partir de esta fecha y la frecuencia se calculan los siguientes.
    first_due_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class ServicePayment(UUIDPrimaryKey, Timestamps, Base):
    """Un período (vencimiento) concreto de un servicio.

    Guarda su propio importe: si cambia el importe estimado del servicio, los períodos
    anteriores no se modifican.
    """

    __tablename__ = "service_payments"
    __table_args__ = (
        # Garantía contra duplicados: un solo período por servicio y fecha de vencimiento.
        UniqueConstraint("service_id", "due_date"),
        CheckConstraint("amount_due IS NULL OR amount_due > 0", name="amount_due_positive"),
        CheckConstraint("amount_paid IS NULL OR amount_paid > 0", name="amount_paid_positive"),
        CheckConstraint(
            "status = 'pending' OR (paid_on IS NOT NULL AND amount_paid IS NOT NULL)",
            name="paid_requires_data",
        ),
        ForeignKeyConstraint(
            ["household_id", "service_id"],
            ["services.household_id", "services.id"],
            ondelete="RESTRICT",
        ),
        # El gasto que registra este pago. UNIQUE: un mismo movimiento no puede pagar dos períodos,
        # y como el pago apunta al movimiento (en lugar de crear otro), el gasto no se duplica.
        ForeignKeyConstraint(
            ["household_id", "transaction_id"],
            ["transactions.household_id", "transactions.id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("transaction_id"),
        UniqueConstraint("household_id", "id"),
        Index("ix_service_payments_household_due", "household_id", "due_date"),
    )

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    service_id: Mapped[uuid.UUID] = mapped_column()
    due_date: Mapped[date] = mapped_column(Date)
    amount_due: Mapped[Decimal | None] = mapped_column(Money)
    status: Mapped[ServicePaymentStatus] = mapped_column(
        str_enum(ServicePaymentStatus, "service_payment_status"),
        default=ServicePaymentStatus.PENDING,
        server_default=ServicePaymentStatus.PENDING.value,
    )
    paid_on: Mapped[date | None] = mapped_column(Date)
    amount_paid: Mapped[Decimal | None] = mapped_column(Money)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column()
    paid_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    notes: Mapped[str | None] = mapped_column(Text)
