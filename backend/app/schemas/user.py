import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

from app.models.enums import UserRole

PASSWORD_MIN_LENGTH = 6
PASSWORD_MAX_LENGTH = 128
USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 40
# Letras minúsculas sin acentos, números, punto, guion y guion bajo (ej. "ana", "leo.perez").
USERNAME_PATTERN = r"^[a-z0-9._-]+$"


def _normalize_username(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


# BeforeValidator corre ANTES de las reglas: " Ana " se valida (y guarda) como "ana".
# (to_lower de StringConstraints no sirve acá: Pydantic aplica el patrón antes de convertir.)
Username = Annotated[
    str,
    BeforeValidator(_normalize_username),
    StringConstraints(
        min_length=USERNAME_MIN_LENGTH, max_length=USERNAME_MAX_LENGTH, pattern=USERNAME_PATTERN
    ),
]

# Largo mínimo en lugar de reglas de "mayúscula + número + símbolo": las frases largas son más
# seguras y fáciles de recordar (recomendación actual de NIST).
Password = Annotated[
    str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    full_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime


class MemberOut(BaseModel):
    """Vista mínima de un integrante, visible para todo el hogar."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    is_active: bool


# Roles que se asignan dentro de un hogar (el de superadmin no se puede asignar desde la app).
HouseholdRole = Literal[UserRole.ADMIN, UserRole.MEMBER]


class UserCreate(BaseModel):
    username: Username
    full_name: FullName
    password: Password
    role: HouseholdRole = UserRole.MEMBER


class UserUpdate(BaseModel):
    """Solo se modifican los campos enviados."""

    username: Username | None = None
    full_name: FullName | None = None
    role: HouseholdRole | None = None
    is_active: bool | None = None

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True, exclude_none=True)


class PasswordReset(BaseModel):
    new_password: Password
