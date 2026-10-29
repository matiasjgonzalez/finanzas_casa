import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.user import Password, UserOut


class LoginRequest(BaseModel):
    # Sin validar el formato: cualquier error de inicio de sesión responde igual.
    username: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    password: Annotated[str, StringConstraints(max_length=256)]


class HouseholdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    currency: str


class MeOut(BaseModel):
    user: UserOut
    # None para el superadmin, que no pertenece a ningún hogar.
    household: HouseholdOut | None


class ChangePasswordRequest(BaseModel):
    current_password: Annotated[str, StringConstraints(max_length=256)]
    new_password: Password
