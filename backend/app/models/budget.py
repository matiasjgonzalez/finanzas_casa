import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey
from app.models.transaction import Money


class Budget(UUIDPrimaryKey, Timestamps, Base):
    """Límite mensual de gasto de una categoría, vigente desde `month` hasta la próxima fila.

    Cambiar el presupuesto crea una fila desde ese mes: los meses anteriores conservan el
    límite que tenían. Una fila sin importe significa "sin presupuesto desde este mes".
    """

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("household_id", "category_id", "month"),
        CheckConstraint("amount IS NULL OR amount > 0", name="amount_positive"),
        CheckConstraint("EXTRACT(DAY FROM month) = 1", name="month_first_day"),
        ForeignKeyConstraint(
            ["household_id", "category_id"],
            ["categories.household_id", "categories.id"],
            ondelete="RESTRICT",
        ),
    )

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID] = mapped_column()
    # Primer día del mes (ej. 2026-10-01).
    month: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal | None] = mapped_column(Money)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
