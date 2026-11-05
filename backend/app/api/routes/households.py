"""Administración de hogares: solo el superadmin.

El superadmin ve nombres, estados y usuarios de cada hogar, pero ninguna ruta de este módulo
devuelve pagos, categorías, servicios ni comprobantes.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, StringConstraints

from app.api.deps import DbSession, SuperAuth, client_ip
from app.schemas.user import (
    FullName,
    Password,
    PasswordReset,
    UserCreate,
    Username,
    UserOut,
    UserUpdate,
)
from app.services import households as households_service
from app.services import users as users_service
from app.services.households import HouseholdSummary

router = APIRouter(prefix="/households", tags=["households"])

HouseholdName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class HouseholdCreate(BaseModel):
    name: HouseholdName
    admin_full_name: FullName
    admin_username: Username
    # Contraseña provisoria: el administrador la cambia al ingresar por primera vez.
    admin_password: Password


class HouseholdUpdate(BaseModel):
    name: HouseholdName | None = None
    is_active: bool | None = None

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True, exclude_none=True)


@router.get("")
def list_households(auth: SuperAuth, db: DbSession) -> list[HouseholdSummary]:
    return households_service.list_households(db)


class HouseholdOverview(HouseholdSummary):
    members: list[UserOut]


# Antes de "/{household_id}": si no, "overview" se tomaría como el id de un hogar.
@router.get("/overview")
def households_overview(auth: SuperAuth, db: DbSession) -> list[HouseholdOverview]:
    """Panel del superadmin: todos los hogares con sus cuentas (sin datos financieros)."""
    return [
        HouseholdOverview(
            **household.model_dump(), members=[UserOut.model_validate(u) for u in members]
        )
        for household, members in households_service.overview(db)
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_household(body: HouseholdCreate, auth: SuperAuth, db: DbSession) -> HouseholdSummary:
    admin = households_service.create_household_with_admin(
        db,
        household_name=body.name,
        admin_name=body.admin_full_name,
        admin_username=body.admin_username,
        admin_password=body.admin_password,
        must_change_password=True,
        actor=auth.user,
    )
    return households_service.summary(db, admin.household_id)


@router.get("/{household_id}")
def get_household(household_id: uuid.UUID, auth: SuperAuth, db: DbSession) -> HouseholdSummary:
    households_service.get_household(db, household_id)
    return households_service.summary(db, household_id)


@router.patch("/{household_id}")
def update_household(
    household_id: uuid.UUID, body: HouseholdUpdate, auth: SuperAuth, db: DbSession
) -> HouseholdSummary:
    households_service.update_household(db, auth.user, household_id, body.changes())
    return households_service.summary(db, household_id)


@router.get("/{household_id}/users")
def list_household_users(household_id: uuid.UUID, auth: SuperAuth, db: DbSession) -> list[UserOut]:
    households_service.get_household(db, household_id)
    return [UserOut.model_validate(u) for u in users_service.list_users(db, household_id)]


@router.post("/{household_id}/users", status_code=status.HTTP_201_CREATED)
def create_household_user(
    household_id: uuid.UUID, body: UserCreate, auth: SuperAuth, request: Request, db: DbSession
) -> UserOut:
    households_service.get_household(db, household_id)
    user = users_service.create_user(
        db,
        auth.user,
        household_id=household_id,
        username=body.username,
        full_name=body.full_name,
        password=body.password,
        role=body.role,
        ip_address=client_ip(request),
    )
    return UserOut.model_validate(user)


@router.get("/{household_id}/users/{user_id}")
def get_household_user(
    household_id: uuid.UUID, user_id: uuid.UUID, auth: SuperAuth, db: DbSession
) -> UserOut:
    return UserOut.model_validate(users_service.get_user(db, household_id, user_id))


@router.patch("/{household_id}/users/{user_id}")
def update_household_user(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UserUpdate,
    auth: SuperAuth,
    request: Request,
    db: DbSession,
) -> UserOut:
    user = users_service.update_user(
        db,
        auth.user,
        user_id,
        household_id=household_id,
        changes=body.changes(),
        ip_address=client_ip(request),
    )
    return UserOut.model_validate(user)


@router.post(
    "/{household_id}/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT
)
def reset_household_user_password(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    body: PasswordReset,
    auth: SuperAuth,
    request: Request,
    db: DbSession,
) -> None:
    users_service.reset_password(
        db, auth.user, user_id, body.new_password, client_ip(request), household_id=household_id
    )
