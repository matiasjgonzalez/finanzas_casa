"""Hogares: creación (con su primer administrador y categorías iniciales) y administración.

La administración de hogares la hace el superadmin, que NO pertenece a ningún hogar y no
accede a sus datos financieros: solo ve nombres, estado y usuarios.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models import Category, Household, User
from app.models.enums import CategoryStructure, UserRole
from app.services import audit
from app.services.users import ensure_username_available, normalize_username, revoke_all_sessions

# Categorías iniciales (vacías: los tipos y los autos los carga el administrador del hogar).
# (nombre, estructura, nombre de cada elemento, ícono de lucide-react)
DEFAULT_CATEGORIES = [
    ("Tarjeta de crédito", CategoryStructure.TYPES, None, "credit-card"),
    ("Servicio", CategoryStructure.TYPES, None, "plug"),
    ("Auto", CategoryStructure.ITEMS_AND_TYPES, "Auto", "car"),
]


class HouseholdSummary(BaseModel):
    """Lo que ve el superadmin de un hogar: nada de datos financieros."""

    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime
    users_count: int
    admins_count: int


def _ensure_name_free(db: Session, name: str, exclude: uuid.UUID | None = None) -> None:
    query = select(Household.id).where(func.lower(Household.name) == name.lower())
    if exclude:
        query = query.where(Household.id != exclude)
    if db.scalar(query):
        raise ConflictError(f"Ya existe un hogar llamado «{name}».")


def superadmin_exists(db: Session) -> bool:
    return bool(db.scalar(select(User.id).where(User.role == UserRole.SUPERADMIN)))


def create_superadmin(
    db: Session, *, full_name: str, username: str, password: str, must_change_password: bool
) -> User:
    username = normalize_username(username)
    ensure_username_available(db, username)
    user = User(
        household_id=None,
        username=username,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        role=UserRole.SUPERADMIN,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.flush()
    audit.record(db, "superadmin.created", actor=user, entity_type="user", entity_id=user.id)
    db.commit()
    return user


def create_household_with_admin(
    db: Session,
    *,
    household_name: str,
    admin_name: str,
    admin_username: str,
    admin_password: str,
    must_change_password: bool = False,
    actor: User | None = None,
) -> User:
    """Crea el hogar, su administrador y las categorías iniciales.

    Todo ocurre en una única transacción: o se crea todo, o no se crea nada.
    """
    username = normalize_username(admin_username)
    ensure_username_available(db, username)
    _ensure_name_free(db, household_name.strip())

    household = Household(name=household_name.strip())
    db.add(household)
    db.flush()

    admin = User(
        household_id=household.id,
        username=username,
        full_name=admin_name.strip(),
        password_hash=hash_password(admin_password),
        role=UserRole.ADMIN,
        must_change_password=must_change_password,
    )
    db.add(admin)
    db.add_all(
        Category(
            household_id=household.id,
            name=name,
            structure=structure,
            item_label=item_label,
            icon=icon,
        )
        for name, structure, item_label, icon in DEFAULT_CATEGORIES
    )
    db.flush()

    audit.record(
        db,
        "household.created",
        actor=actor or admin,
        household_id=household.id,
        entity_type="household",
        entity_id=household.id,
        details={"name": household.name, "admin_username": username},
    )
    db.commit()
    return admin


def list_households(db: Session) -> list[HouseholdSummary]:
    rows = db.execute(
        select(
            Household,
            func.count(User.id),
            func.count(case((User.role == UserRole.ADMIN, User.id))),
        )
        .outerjoin(User, User.household_id == Household.id)
        .group_by(Household.id)
        .order_by(func.lower(Household.name))
    ).all()
    return [
        HouseholdSummary(
            id=h.id,
            name=h.name,
            is_active=h.is_active,
            created_at=h.created_at,
            users_count=users,
            admins_count=admins,
        )
        for h, users, admins in rows
    ]


def get_household(db: Session, household_id: uuid.UUID) -> Household:
    household = db.get(Household, household_id)
    if household is None:
        raise NotFoundError("Hogar no encontrado.")
    return household


def summary(db: Session, household_id: uuid.UUID) -> HouseholdSummary:
    return next(h for h in list_households(db) if h.id == household_id)


def overview(db: Session) -> list[tuple[HouseholdSummary, list[User]]]:
    """Cada hogar con sus cuentas (administradores primero), para el panel del superadmin.
    Solo datos de las cuentas: nada financiero."""
    members: dict[uuid.UUID, list[User]] = {}
    for user in db.scalars(select(User).where(User.household_id.is_not(None))):
        members.setdefault(user.household_id, []).append(user)
    return [
        (
            household,
            sorted(
                members.get(household.id, []),
                key=lambda u: (u.role != UserRole.ADMIN, u.full_name.lower()),
            ),
        )
        for household in list_households(db)
    ]


def update_household(
    db: Session, actor: User, household_id: uuid.UUID, changes: dict[str, object]
) -> Household:
    household = get_household(db, household_id)
    if "name" in changes:
        name = str(changes["name"]).strip()
        _ensure_name_free(db, name, exclude=household.id)
        household.name = name
    if "is_active" in changes and changes["is_active"] != household.is_active:
        household.is_active = bool(changes["is_active"])
        if not household.is_active:
            # Desactivar cierra en el acto las sesiones abiertas de todo el hogar.
            for user_id in db.scalars(select(User.id).where(User.household_id == household.id)):
                revoke_all_sessions(db, user_id)
    audit.record(
        db,
        "household.updated",
        actor=actor,
        household_id=household.id,
        entity_type="household",
        entity_id=household.id,
        details={"name": household.name, "is_active": household.is_active},
    )
    db.commit()
    return household
