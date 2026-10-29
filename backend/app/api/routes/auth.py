from fastapi import APIRouter, Request, Response, status

from app.api.deps import (
    SESSION_COOKIE,
    DbSession,
    SessionAuth,
    clear_session_cookies,
    client_ip,
    set_session_cookies,
)
from app.models import Household, User
from app.schemas.auth import ChangePasswordRequest, HouseholdOut, LoginRequest, MeOut
from app.schemas.user import UserOut
from app.services import auth as auth_service
from app.services import users as users_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _me(db: DbSession, user: User) -> MeOut:
    # El superadmin no pertenece a ningún hogar.
    household = db.get(Household, user.household_id) if user.household_id else None
    return MeOut(
        user=UserOut.model_validate(user),
        household=HouseholdOut.model_validate(household) if household else None,
    )


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: DbSession) -> MeOut:
    """Inicia sesión. Deja la cookie de sesión (HttpOnly) y la cookie con el token CSRF."""
    # Si había una sesión abierta en este navegador, se cierra (evita reutilizar sesiones viejas).
    previous_token = request.cookies.get(SESSION_COOKIE)
    if previous_token and (previous := auth_service.resolve_session(db, previous_token)):
        auth_service.logout(db, previous[0])

    user, new_session = auth_service.login(
        db, body.username, body.password, client_ip(request), request.headers.get("user-agent")
    )
    set_session_cookies(response, new_session.token, new_session.csrf_token)
    return _me(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(auth: SessionAuth, response: Response, db: DbSession) -> None:
    auth_service.logout(db, auth.session)
    clear_session_cookies(response)


@router.get("/me")
def me(auth: SessionAuth, db: DbSession) -> MeOut:
    return _me(db, auth.user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest, auth: SessionAuth, request: Request, db: DbSession
) -> None:
    users_service.change_own_password(
        db,
        auth.user,
        auth.session.id,
        body.current_password,
        body.new_password,
        ip_address=client_ip(request),
    )
