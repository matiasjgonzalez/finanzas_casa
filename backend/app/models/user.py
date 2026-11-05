import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import UserRole, str_enum


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("household_id", "id"),
        # El superadmin administra hogares pero no pertenece a ninguno: así, por construcción,
        # no puede ver ni registrar datos financieros. Todos los demás usuarios tienen hogar.
        CheckConstraint(
            "(role = 'superadmin') = (household_id IS NULL)", name="superadmin_has_no_household"
        ),
    )

    # RESTRICT: no se puede borrar un hogar que tenga usuarios.
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    # Nombre con el que se inicia sesión (ej. "ana"). Se guarda en minúsculas.
    username: Mapped[str] = mapped_column(String(40))
    full_name: Mapped[str] = mapped_column(String(120))
    # Hash Argon2 (nunca la contraseña en texto).
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(str_enum(UserRole, "user_role"), default=UserRole.MEMBER)
    # Los usuarios no se eliminan: se desactivan, para conservar quién creó cada movimiento.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # True cuando la contraseña la asignó otra persona (o es la inicial "admin"): hasta cambiarla,
    # el usuario solo puede cambiar su contraseña o cerrar sesión.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# El nombre de usuario es único en todo el sistema sin importar mayúsculas: se inicia sesión con él.
Index("uq_users_username_lower", func.lower(User.username), unique=True)


class UserSession(UUIDPrimaryKey, Base):
    """Sesión iniciada. El navegador guarda el token en una cookie HttpOnly; acá solo su hash."""

    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))


class LoginAttempt(Base):
    """Intentos de inicio de sesión, para limitar ataques de fuerza bruta."""

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_username_created", "username", "created_at"),
        Index("ix_login_attempts_ip_created", "ip_address", "created_at"),
        Index("ix_login_attempts_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(254))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    succeeded: Mapped[bool] = mapped_column(Boolean)
    # Por qué terminó así (ver LOGIN_RESULTS en services/auth.py). Solo lo ve el superadmin: a
    # quien intenta entrar se le responde siempre lo mismo.
    result: Mapped[str] = mapped_column(String(20), server_default="failed")
    user_agent: Mapped[str | None] = mapped_column(String(255))
    # Desbloqueado por el superadmin: el intento queda en el historial pero ya no cuenta.
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
