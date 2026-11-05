"""Panel de seguridad del superadmin: los intentos de ingreso y los bloqueos.

Son datos de las cuentas (quién intentó entrar, cuándo y desde dónde), nunca financieros.
"""

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ValidationError
from app.models import Household, LoginAttempt, User
from app.services import audit
from app.services.auth import LOGIN_OK, LOGIN_UNKNOWN_USER, counted_failure
from app.services.users import normalize_username

PANEL_DAYS = 30
MAX_ATTEMPTS_SHOWN = 300
# Un usuario con esta cantidad de fallos en 24 h aparece como aviso (aunque no llegue a bloquearse).
SUSPICIOUS_FAILURES = 3
NEW_IP_ALERT_DAYS = 7


class Attempt(BaseModel):
    id: int
    created_at: datetime
    username: str
    household: str | None
    result: str
    ip_address: str | None
    user_agent: str | None
    # Ingreso correcto desde una IP que esa cuenta nunca había usado.
    new_ip: bool


class Lock(BaseModel):
    kind: str  # "username" o "ip"
    value: str
    failures: int
    unlock_at: datetime


class Summary(BaseModel):
    days: int
    ok: int
    failed: int
    blocked: int
    unknown_user: int
    ips: int


class SuspiciousUser(BaseModel):
    username: str
    failures: int


class Overview(BaseModel):
    summary: Summary
    locks: list[Lock]
    suspicious_users: list[SuspiciousUser]
    unknown_usernames: list[str]
    new_ip_logins: int
    attempts: list[Attempt]
    # La IP con la que la app ve a quien mira el panel: para comprobar que, detrás del proxy de
    # Railway, se registra la IP real de cada persona y no la del proxy.
    your_ip: str | None


def _households_by_username(db: Session, usernames: set[str]) -> dict[str, str | None]:
    rows = db.execute(
        select(func.lower(User.username), Household.name)
        .outerjoin(Household, Household.id == User.household_id)
        .where(func.lower(User.username).in_(usernames))
    ).all()
    # Las cuentas del superadmin no tienen hogar.
    return {username: name or "Superadmin" for username, name in rows}


def _new_ip_flags(attempts: list[LoginAttempt], history: list[LoginAttempt]) -> set[int]:
    """Ingresos correctos desde una IP nueva para esa cuenta (el primer ingreso de una cuenta no
    cuenta: todas las IP serían nuevas)."""
    seen: dict[str, set[str | None]] = {}
    flagged: set[int] = set()
    for a in sorted(history, key=lambda a: (a.created_at, a.id)):
        ips = seen.setdefault(a.username, set())
        if ips and a.ip_address not in ips:
            flagged.add(a.id)
        ips.add(a.ip_address)
    shown = {a.id for a in attempts}
    return flagged & shown


def current_locks(db: Session, now: datetime | None = None) -> list[Lock]:
    settings = get_settings()
    now = now or datetime.now(UTC)
    window = timedelta(minutes=settings.login_window_minutes)
    locks: list[Lock] = []
    for kind, column, limit in (
        ("username", LoginAttempt.username, settings.login_max_failures_per_username),
        ("ip", LoginAttempt.ip_address, settings.login_max_failures_per_ip),
    ):
        rows = db.execute(
            select(column, func.count(), func.min(LoginAttempt.created_at))
            .where(LoginAttempt.created_at >= now - window, column.is_not(None), *counted_failure())
            .group_by(column)
            .having(func.count() >= limit)
        ).all()
        locks += [
            Lock(kind=kind, value=value, failures=count, unlock_at=oldest + window)
            for value, count, oldest in rows
        ]
    return sorted(locks, key=lambda lock: lock.unlock_at)


def overview(db: Session, your_ip: str | None, now: datetime | None = None) -> Overview:
    now = now or datetime.now(UTC)
    since = now - timedelta(days=PANEL_DAYS)

    counts = dict(
        db.execute(
            select(LoginAttempt.result, func.count())
            .where(LoginAttempt.created_at >= since)
            .group_by(LoginAttempt.result)
        ).all()
    )
    ips = db.scalar(
        select(func.count(func.distinct(LoginAttempt.ip_address))).where(
            LoginAttempt.created_at >= since
        )
    )
    blocked = counts.get("blocked", 0)
    summary = Summary(
        days=PANEL_DAYS,
        ok=counts.get(LOGIN_OK, 0),
        blocked=blocked,
        unknown_user=counts.get(LOGIN_UNKNOWN_USER, 0),
        failed=sum(counts.values()) - counts.get(LOGIN_OK, 0) - blocked,
        ips=ips or 0,
    )

    suspicious = db.execute(
        select(LoginAttempt.username, func.count())
        .where(
            LoginAttempt.created_at >= now - timedelta(hours=24),
            LoginAttempt.result != LOGIN_OK,
            LoginAttempt.result != LOGIN_UNKNOWN_USER,
        )
        .group_by(LoginAttempt.username)
        .having(func.count() >= SUSPICIOUS_FAILURES)
        .order_by(func.count().desc())
    ).all()
    unknown = db.scalars(
        select(LoginAttempt.username)
        .where(LoginAttempt.created_at >= since, LoginAttempt.result == LOGIN_UNKNOWN_USER)
        .group_by(LoginAttempt.username)
        .order_by(func.max(LoginAttempt.created_at).desc())
        .limit(20)
    ).all()

    attempts = list(
        db.scalars(
            select(LoginAttempt)
            .where(LoginAttempt.created_at >= since)
            .order_by(LoginAttempt.created_at.desc(), LoginAttempt.id.desc())
            .limit(MAX_ATTEMPTS_SHOWN)
        )
    )
    # Para saber si una IP es nueva hacen falta los ingresos anteriores (de los 180 días que se
    # guardan), no solo los que se muestran.
    history = list(db.scalars(select(LoginAttempt).where(LoginAttempt.result == LOGIN_OK)))
    new_ips = _new_ip_flags(attempts, history)
    households = _households_by_username(db, {a.username for a in attempts})
    recent_new = now - timedelta(days=NEW_IP_ALERT_DAYS)

    return Overview(
        summary=summary,
        locks=current_locks(db, now),
        suspicious_users=[SuspiciousUser(username=u, failures=n) for u, n in suspicious],
        unknown_usernames=list(unknown),
        new_ip_logins=sum(1 for a in attempts if a.id in new_ips and a.created_at >= recent_new),
        attempts=[
            Attempt(
                id=a.id,
                created_at=a.created_at,
                username=a.username,
                household=households.get(a.username),
                result=a.result,
                ip_address=a.ip_address,
                user_agent=a.user_agent,
                new_ip=a.id in new_ips,
            )
            for a in attempts
        ],
        your_ip=your_ip,
    )


def unlock(
    db: Session,
    actor: User,
    *,
    username: str | None,
    ip_address: str | None,
    request_ip: str | None,
) -> int:
    """Levanta un bloqueo ahora: los fallos recientes de ese usuario (o esa IP) dejan de contar.
    Quedan en el historial. Devuelve cuántos intentos se liberaron."""
    if bool(username) == bool(ip_address):
        raise ValidationError("Indicá un usuario o una IP para desbloquear.")
    settings = get_settings()
    window_start = datetime.now(UTC) - timedelta(minutes=settings.login_window_minutes)
    target = (
        LoginAttempt.username == normalize_username(username)
        if username
        else LoginAttempt.ip_address == ip_address
    )
    result = db.execute(
        update(LoginAttempt)
        .where(LoginAttempt.created_at >= window_start, *counted_failure(target))
        .values(cleared_at=datetime.now(UTC))
    )
    audit.record(
        db,
        "security.unlocked",
        actor=actor,
        details={"username": username, "ip_address": ip_address, "attempts": result.rowcount},
        ip_address=request_ip,
    )
    db.commit()
    return result.rowcount
