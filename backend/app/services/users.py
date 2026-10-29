"""Gestión de usuarios del hogar (solo administradores, salvo el cambio de la propia contraseña)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import AuthenticationError, ConflictError, NotFoundError, ValidationError
from app.core.security import hash_password, verify_password
from app.models import User, UserSession
from app.models.enums import UserRole
from app.services import audit


def normalize_username(username: str) -> str:
    """Los nombres de usuario no distinguen mayúsculas: "Ana" y "ana" son el mismo."""
    return username.strip().lower()


def list_users(db: Session, household_id: uuid.UUID) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.household_id == household_id)
            .order_by(User.is_active.desc(), User.full_name)
        )
    )


def get_user(db: Session, household_id: uuid.UUID, user_id: uuid.UUID) -> User:
    """Busca el usuario DENTRO del hogar. Uno de otro hogar responde igual que uno inexistente."""
    user = db.scalar(select(User).where(User.id == user_id, User.household_id == household_id))
    if user is None:
        raise NotFoundError("Usuario no encontrado.")
    return user


USERNAME_TAKEN = "Ese nombre de usuario ya está en uso."


def ensure_username_available(
    db: Session, username: str, exclude_id: uuid.UUID | None = None
) -> None:
    query = select(User.id).where(func.lower(User.username) == username)
    if exclude_id:
        query = query.where(User.id != exclude_id)
    if db.scalar(query):
        raise ConflictError(USERNAME_TAKEN)


def _lock_active_admins(db: Session, household_id: uuid.UUID) -> list[uuid.UUID]:
    """Devuelve los administradores activos y BLOQUEA esas filas hasta el commit.

    Si dos administradores intentan quitarse el rol al mismo tiempo, el segundo espera al
    primero y ve el resultado actualizado: el hogar nunca queda sin administradores.
    """
    return list(
        db.scalars(
            select(User.id)
            .where(User.household_id == household_id, User.role == UserRole.ADMIN, User.is_active)
            .with_for_update()
        )
    )


def revoke_all_sessions(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def _target_household(actor: User, household_id: uuid.UUID | None) -> uuid.UUID:
    """Hogar sobre el que se actúa: el indicado (superadmin) o el propio (administrador)."""
    target = household_id or actor.household_id
    if target is None:
        raise NotFoundError("Hogar no encontrado.")
    return target


def create_user(
    db: Session,
    admin: User,
    *,
    household_id: uuid.UUID | None = None,
    username: str,
    full_name: str,
    password: str,
    role: UserRole,
    ip_address: str | None = None,
) -> User:
    hid = _target_household(admin, household_id)
    username = normalize_username(username)
    ensure_username_available(db, username)
    user = User(
        household_id=hid,
        username=username,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        role=role,
        # La contraseña inicial la eligió el administrador: la persona la cambia al ingresar.
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    audit.record(
        db,
        "user.created",
        actor=admin,
        household_id=hid,
        entity_type="user",
        entity_id=user.id,
        details={"username": username, "role": role.value},
        ip_address=ip_address,
    )
    db.commit()
    return user


def update_user(
    db: Session,
    admin: User,
    user_id: uuid.UUID,
    *,
    household_id: uuid.UUID | None = None,
    changes: dict[str, object],
    ip_address: str | None = None,
) -> User:
    """Aplica los cambios indicados (username, full_name, role, is_active)."""
    hid = _target_household(admin, household_id)
    active_admins = _lock_active_admins(db, hid)
    user = get_user(db, hid, user_id)
    db.refresh(user)  # datos actualizados después de esperar el bloqueo

    if "username" in changes:
        changes["username"] = normalize_username(str(changes["username"]))
        ensure_username_available(db, changes["username"], exclude_id=user.id)
    if "full_name" in changes:
        changes["full_name"] = str(changes["full_name"]).strip()

    loses_admin = (
        user.role == UserRole.ADMIN
        and user.is_active
        and (
            changes.get("role", UserRole.ADMIN) != UserRole.ADMIN
            or changes.get("is_active") is False
        )
    )
    if loses_admin and len(active_admins) <= 1:
        raise ConflictError(
            "El hogar debe tener al menos un administrador activo. "
            "Asigná el rol de administrador a otra persona antes de hacer este cambio."
        )

    previous = {field: getattr(user, field) for field in changes}
    for field, value in changes.items():
        setattr(user, field, value)

    if changes.get("is_active") is False:
        revoke_all_sessions(db, user.id)

    changed = {
        field: {"from": str(previous[field]), "to": str(value)}
        for field, value in changes.items()
        if previous[field] != value
    }
    if changed:
        audit.record(
            db,
            "user.updated",
            actor=admin,
            household_id=hid,
            entity_type="user",
            entity_id=user.id,
            details=changed,
            ip_address=ip_address,
        )
    db.commit()
    return user


def reset_password(
    db: Session,
    admin: User,
    user_id: uuid.UUID,
    new_password: str,
    ip_address: str | None = None,
    *,
    household_id: uuid.UUID | None = None,
) -> None:
    """El administrador asigna una contraseña nueva. Se cierran todas las sesiones del usuario.

    La persona deberá cambiarla al ingresar, así el administrador no conoce la definitiva.
    """
    hid = _target_household(admin, household_id)
    user = get_user(db, hid, user_id)
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    revoke_all_sessions(db, user.id)
    audit.record(
        db,
        "user.password_reset",
        actor=admin,
        household_id=hid,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip_address,
    )
    db.commit()


def change_own_password(
    db: Session,
    user: User,
    current_session_id: uuid.UUID,
    current_password: str,
    new_password: str,
    ip_address: str | None = None,
) -> None:
    """Cambio de la propia contraseña. Se cierran las demás sesiones (otros dispositivos)."""
    if not verify_password(current_password, user.password_hash):
        raise AuthenticationError("La contraseña actual no es correcta.")
    if new_password == current_password:
        raise ValidationError("La nueva contraseña tiene que ser distinta de la actual.")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.id != current_session_id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    audit.record(
        db,
        "user.password_changed",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip_address,
    )
    db.commit()
