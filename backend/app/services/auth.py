"""Inicio de sesión, sesiones y límite de intentos."""

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthenticationError, TooManyAttemptsError
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.models import Household, LoginAttempt, User, UserSession
from app.services import audit
from app.services.users import normalize_username

# Mismo mensaje para usuario inexistente, contraseña incorrecta o cuenta desactivada:
# así no se puede averiguar qué nombres de usuario existen.
INVALID_CREDENTIALS = "Usuario o contraseña incorrectos."

# El vencimiento se extiende como máximo una vez por hora (evita escribir en cada petición).
SESSION_REFRESH_INTERVAL = timedelta(hours=1)


@dataclass
class NewSession:
    session: UserSession
    token: str
    csrf_token: str


def _check_throttle(db: Session, username: str, ip_address: str | None) -> None:
    settings = get_settings()
    window_start = datetime.now(UTC) - timedelta(minutes=settings.login_window_minutes)

    def failures_since(*conditions: object) -> tuple[int, datetime | None]:
        count, oldest = db.execute(
            select(func.count(), func.min(LoginAttempt.created_at)).where(
                LoginAttempt.created_at >= window_start,
                LoginAttempt.succeeded.is_(False),
                *conditions,
            )
        ).one()
        return count, oldest

    checks = [
        (
            failures_since(LoginAttempt.username == username),
            settings.login_max_failures_per_username,
        )
    ]
    if ip_address:
        checks.append(
            (
                failures_since(LoginAttempt.ip_address == ip_address),
                settings.login_max_failures_per_ip,
            )
        )

    for (count, oldest), limit in checks:
        if count >= limit and oldest is not None:
            unlock_at = oldest + timedelta(minutes=settings.login_window_minutes)
            seconds = max(1, math.ceil((unlock_at - datetime.now(UTC)).total_seconds()))
            minutes = math.ceil(seconds / 60)
            raise TooManyAttemptsError(
                f"Demasiados intentos fallidos. Esperá {minutes} minuto(s) y volvé a intentar.",
                retry_after_seconds=seconds,
            )


def authenticate(db: Session, username: str, password: str, ip_address: str | None) -> User:
    username = normalize_username(username)
    _check_throttle(db, username, ip_address)

    user = db.scalar(select(User).where(func.lower(User.username) == username))
    # verify_password se ejecuta siempre (aunque el usuario no exista) para igualar los tiempos.
    password_ok = verify_password(password, user.password_hash if user else None)
    household_ok = (
        user is None
        or user.household_id is None
        or bool(db.scalar(select(Household.is_active).where(Household.id == user.household_id)))
    )
    succeeded = user is not None and password_ok and user.is_active and household_ok

    db.add(LoginAttempt(username=username, ip_address=ip_address, succeeded=succeeded))
    if user is None or not succeeded:
        db.commit()  # el intento fallido queda registrado aunque la petición termine con error
        raise AuthenticationError(INVALID_CREDENTIALS)

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = datetime.now(UTC)
    return user


def create_session(
    db: Session, user: User, ip_address: str | None, user_agent: str | None
) -> NewSession:
    token, csrf_token = generate_token(), generate_token()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=datetime.now(UTC) + timedelta(days=get_settings().session_days),
        ip_address=ip_address,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    audit.record(db, "auth.login", actor=user, ip_address=ip_address)
    db.commit()
    return NewSession(session=session, token=token, csrf_token=csrf_token)


def login(
    db: Session, username: str, password: str, ip_address: str | None, user_agent: str | None
) -> tuple[User, NewSession]:
    user = authenticate(db, username, password, ip_address)
    return user, create_session(db, user, ip_address, user_agent)


def resolve_session(db: Session, token: str) -> tuple[UserSession, User] | None:
    """Devuelve la sesión y su usuario si el token es válido, vigente y el usuario está activo."""
    row = db.execute(
        select(UserSession, User, Household.is_active)
        .join(User, User.id == UserSession.user_id)
        # outer join: el superadmin no tiene hogar.
        .outerjoin(Household, Household.id == User.household_id)
        .where(UserSession.token_hash == hash_token(token))
    ).one_or_none()
    if row is None:
        return None
    session, user, household_active = row
    now = datetime.now(UTC)
    if session.revoked_at is not None or session.expires_at <= now or not user.is_active:
        return None
    # Un hogar desactivado por el superadmin pierde el acceso al instante.
    if user.household_id is not None and not household_active:
        return None
    return session, user


def touch_session(db: Session, session: UserSession) -> bool:
    """Extiende la sesión si pasó suficiente tiempo desde la última actividad. True si cambió."""
    now = datetime.now(UTC)
    if now - session.last_seen_at < SESSION_REFRESH_INTERVAL:
        return False
    session.last_seen_at = now
    session.expires_at = now + timedelta(days=get_settings().session_days)
    db.commit()
    return True


def logout(db: Session, session: UserSession) -> None:
    session.revoked_at = datetime.now(UTC)
    db.commit()
