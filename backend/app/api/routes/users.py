"""Gestión de usuarios: todas las rutas requieren rol de administrador."""

import uuid

from fastapi import APIRouter, Request, status

from app.api.deps import AdminAuth, CurrentAuth, DbSession, client_ip
from app.schemas.user import MemberOut, PasswordReset, UserCreate, UserOut, UserUpdate
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])
members_router = APIRouter(tags=["users"])


@members_router.get("/members")
def list_members(auth: CurrentAuth, db: DbSession) -> list[MemberOut]:
    """Integrantes del hogar (solo nombre): para filtros y para mostrar quién registró qué.

    A diferencia de /users, lo puede consultar cualquier integrante y no expone datos de acceso.
    """
    return [
        MemberOut.model_validate(u) for u in users_service.list_users(db, auth.user.household_id)
    ]


@router.get("")
def list_users(auth: AdminAuth, db: DbSession) -> list[UserOut]:
    return [UserOut.model_validate(u) for u in users_service.list_users(db, auth.user.household_id)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, auth: AdminAuth, request: Request, db: DbSession) -> UserOut:
    user = users_service.create_user(
        db,
        auth.user,
        username=body.username,
        full_name=body.full_name,
        password=body.password,
        role=body.role,
        ip_address=client_ip(request),
    )
    return UserOut.model_validate(user)


@router.get("/{user_id}")
def get_user(user_id: uuid.UUID, auth: AdminAuth, db: DbSession) -> UserOut:
    return UserOut.model_validate(users_service.get_user(db, auth.user.household_id, user_id))


@router.patch("/{user_id}")
def update_user(
    user_id: uuid.UUID, body: UserUpdate, auth: AdminAuth, request: Request, db: DbSession
) -> UserOut:
    user = users_service.update_user(
        db, auth.user, user_id, changes=body.changes(), ip_address=client_ip(request)
    )
    return UserOut.model_validate(user)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: uuid.UUID, body: PasswordReset, auth: AdminAuth, request: Request, db: DbSession
) -> None:
    users_service.reset_password(
        db, auth.user, user_id, body.new_password, ip_address=client_ip(request)
    )
