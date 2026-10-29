from sqlalchemy import Boolean, CheckConstraint, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey


class Household(UUIDPrimaryKey, Timestamps, Base):
    """Hogar: unidad que agrupa usuarios y toda su información financiera.

    Todas las tablas de datos tienen household_id, lo que permite varios hogares independientes.
    """

    __tablename__ = "households"
    __table_args__ = (CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso"),)

    name: Mapped[str] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3), default="ARS", server_default="ARS")
    timezone: Mapped[str] = mapped_column(
        String(64),
        default="America/Argentina/Buenos_Aires",
        server_default="America/Argentina/Buenos_Aires",
    )
    # Un hogar desactivado (por el superadmin) no puede iniciar sesión; sus datos se conservan.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
