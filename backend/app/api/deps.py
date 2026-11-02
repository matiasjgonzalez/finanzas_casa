"""Dependencias compartidas por las rutas: base de datos, usuario actual y permisos.

Toda ruta protegida declara CurrentAuth o AdminAuth. La autorización se decide acá,
en el backend, sin importar lo que muestre u oculte el frontend.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.security import tokens_match
from app.models import User, UserSession
from app.models.enums import UserRole
from app.services import auth as auth_service
from app.storage import DatabaseStorage, LocalStorage, Storage

SESSION_COOKIE = "ff_session"
CSRF_COOKIE = "ff_csrf"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

DbSession = Annotated[Session, Depends(get_db)]


@dataclass
class AuthContext:
    user: User
    session: UserSession


def client_ip(request: Request) -> str | None:
    """IP de quien hace la petición (para el bloqueo por intentos fallidos y el historial)."""
    if get_settings().trust_proxy:
        # El proxy de Railway informa la IP real en X-Real-IP. Si no está, se toma la ÚLTIMA de
        # X-Forwarded-For: la agrega el propio proxy (las anteriores las puede inventar el cliente).
        real = request.headers.get("x-real-ip")
        forwarded = request.headers.get("x-forwarded-for")
        if real:
            return real.strip()
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else None


def set_session_cookies(response: Response, session_token: str, csrf_token: str) -> None:
    settings = get_settings()
    common = {
        "max_age": settings.session_days * 24 * 60 * 60,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    # HttpOnly: JavaScript no puede leer el token de sesión (protege contra robo por XSS).
    response.set_cookie(SESSION_COOKIE, session_token, httponly=True, **common)
    # El token CSRF SÍ debe poder leerlo el frontend, para enviarlo en el encabezado X-CSRF-Token.
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, **common)


def clear_session_cookies(response: Response) -> None:
    for name in (SESSION_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, path="/", secure=get_settings().cookie_secure, samesite="lax")


def get_session_auth(request: Request, response: Response, db: DbSession) -> AuthContext:
    """Sesión válida, aunque el usuario todavía deba cambiar su contraseña.

    Solo la usan las rutas que ese usuario necesita: ver sus datos, cambiar la contraseña y salir.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise AuthenticationError("Iniciá sesión para continuar.")

    resolved = auth_service.resolve_session(db, token)
    if resolved is None:
        raise AuthenticationError("Tu sesión expiró. Iniciá sesión nuevamente.")
    session, user = resolved

    # Protección CSRF: las operaciones que modifican datos deben incluir el token de la sesión.
    # Otro sitio no puede leer nuestras cookies, así que no puede conocer ese token.
    if request.method not in SAFE_METHODS:
        csrf_header = request.headers.get(CSRF_HEADER)
        if not csrf_header or not tokens_match(csrf_header, session.csrf_token_hash):
            raise PermissionDeniedError(
                "La solicitud fue rechazada por seguridad. Recargá la página e intentá de nuevo."
            )

    if auth_service.touch_session(db, session):
        set_session_cookies(response, token, request.cookies.get(CSRF_COOKIE, ""))

    return AuthContext(user=user, session=session)


SessionAuth = Annotated[AuthContext, Depends(get_session_auth)]

PASSWORD_CHANGE_REQUIRED = "Tenés que cambiar tu contraseña antes de continuar."  # noqa: S105


def _ready(auth: AuthContext) -> AuthContext:
    if auth.user.must_change_password:
        raise PermissionDeniedError(PASSWORD_CHANGE_REQUIRED)
    return auth


def get_auth(auth: SessionAuth) -> AuthContext:
    """Usuario de un hogar que ya puede usar la aplicación (la usan casi todas las rutas).

    El superadmin queda afuera: administra hogares, pero no accede a sus datos financieros.
    """
    if auth.user.household_id is None:
        raise PermissionDeniedError(
            "Esta cuenta administra hogares y no tiene acceso a los datos de ninguno."
        )
    return _ready(auth)


CurrentAuth = Annotated[AuthContext, Depends(get_auth)]


def require_admin(auth: CurrentAuth) -> AuthContext:
    if auth.user.role != UserRole.ADMIN:
        raise PermissionDeniedError("Solo un administrador puede realizar esta acción.")
    return auth


AdminAuth = Annotated[AuthContext, Depends(require_admin)]


def require_superadmin(auth: SessionAuth) -> AuthContext:
    if auth.user.role != UserRole.SUPERADMIN:
        raise PermissionDeniedError("Solo el superadmin puede administrar hogares.")
    return _ready(auth)


SuperAuth = Annotated[AuthContext, Depends(require_superadmin)]


def get_storage(db: DbSession) -> Storage:
    """Almacenamiento de comprobantes, según STORAGE_BACKEND (por defecto, en la propia base)."""
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_dir)
    return DatabaseStorage(db)


StorageDep = Annotated[Storage, Depends(get_storage)]
