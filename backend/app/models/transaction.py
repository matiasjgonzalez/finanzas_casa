"""Pagos del hogar y sus comprobantes."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import TransactionStatus, str_enum

# Dinero: NUMERIC(14, 2) -> hasta 999.999.999.999,99 con precisión exacta (nunca float).
Money = Numeric(14, 2)


class Transaction(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso"),
        # FKs compuestas: la base de datos garantiza que la categoría y el autor pertenecen al
        # MISMO hogar que el pago, y que el tipo y el elemento pertenecen a ESA categoría,
        # aunque el código tuviera un error.
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
        ForeignKeyConstraint(
            ["household_id", "created_by_id"],
            ["users.household_id", "users.id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("household_id", "id"),
        # Índices para las consultas frecuentes: listados por fecha e informes por categoría.
        Index("ix_transactions_household_date", "household_id", "occurred_on"),
        Index(
            "ix_transactions_household_category_date", "household_id", "category_id", "occurred_on"
        ),
    )

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    status: Mapped[TransactionStatus] = mapped_column(
        str_enum(TransactionStatus, "transaction_status"),
        default=TransactionStatus.CONFIRMED,
        server_default=TransactionStatus.CONFIRMED.value,
    )
    # Opcional: categoría, tipo y elemento ya describen el pago.
    description: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="ARS", server_default="ARS")
    # Fecha de pago.
    occurred_on: Mapped[date] = mapped_column(Date)
    category_id: Mapped[uuid.UUID] = mapped_column()
    category_type_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    item_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(index=True)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    notes: Mapped[str | None] = mapped_column(Text)


class Attachment(UUIDPrimaryKey, Base):
    """Metadatos de un comprobante. El archivo vive en el almacenamiento privado (storage_key)."""

    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="size_positive"),
        # Cada comprobante pertenece exactamente a un movimiento o a un pago de servicio.
        CheckConstraint(
            "num_nonnulls(transaction_id, service_payment_id) = 1", name="single_owner"
        ),
        ForeignKeyConstraint(
            ["household_id", "transaction_id"],
            ["transactions.household_id", "transactions.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["household_id", "service_payment_id"],
            ["service_payments.household_id", "service_payments.id"],
            ondelete="CASCADE",
        ),
    )

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT"), index=True
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    service_payment_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    # Clave generada por el servidor (nunca el nombre original ni una ruta enviada por el usuario).
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
