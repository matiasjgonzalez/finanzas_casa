"""Categorías de pagos con sus tipos y elementos.

Consultar: cualquier integrante. Crear y modificar: administradores.
Nada se borra (para no romper el historial): se desactiva.
"""

import uuid
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models import Category, CategoryItem, CategoryType, Transaction, User
from app.models.enums import CategoryStructure
from app.schemas.catalog import CatalogEntryOut, CategoryOut
from app.services import audit

USES_TYPES = {CategoryStructure.TYPES, CategoryStructure.ITEMS_AND_TYPES}
USES_ITEMS = {CategoryStructure.ITEMS_AND_TYPES}


# --- Consulta ------------------------------------------------------------------------------


def list_categories(
    db: Session, household_id: uuid.UUID, include_inactive: bool = False
) -> list[CategoryOut]:
    query = select(Category).where(Category.household_id == household_id)
    if not include_inactive:
        query = query.where(Category.is_active)
    categories = list(db.scalars(query.order_by(func.lower(Category.name))))

    def children(model: type[CategoryType] | type[CategoryItem]) -> dict[uuid.UUID, list]:
        child_query = select(model).where(model.household_id == household_id)
        if not include_inactive:
            child_query = child_query.where(model.is_active)
        grouped: dict[uuid.UUID, list] = {}
        for child in db.scalars(child_query.order_by(func.lower(model.name))):
            grouped.setdefault(child.category_id, []).append(CatalogEntryOut.model_validate(child))
        return grouped

    types, items = children(CategoryType), children(CategoryItem)
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            structure=c.structure,
            item_label=c.item_label,
            is_active=c.is_active,
            types=types.get(c.id, []) if c.structure in USES_TYPES else [],
            items=items.get(c.id, []) if c.structure in USES_ITEMS else [],
        )
        for c in categories
    ]


def get_category(db: Session, household_id: uuid.UUID, category_id: uuid.UUID) -> Category:
    """Busca DENTRO del hogar: una de otro hogar responde igual que una inexistente."""
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.household_id == household_id)
    )
    if category is None:
        raise NotFoundError("Categoría no encontrada.")
    return category


def category_out(db: Session, category: Category) -> CategoryOut:
    return next(c for c in list_categories(db, category.household_id, True) if c.id == category.id)


# --- Validación del camino categoría → elemento → tipo (pagos y servicios) -----------------


class _HasCategoryPath(Protocol):
    category_id: uuid.UUID
    category_type_id: uuid.UUID | None
    item_id: uuid.UUID | None


def _check_entry(
    db: Session,
    model: type[CategoryType] | type[CategoryItem],
    entry_id: uuid.UUID | None,
    category: Category,
    *,
    required: bool,
    previous_id: uuid.UUID | None,
    missing: str,
    label: str,
) -> None:
    if not required:
        if entry_id is not None:
            raise ValidationError(f"La categoría «{category.name}» no usa {label}s.")
        return
    if entry_id is None:
        raise ValidationError(missing)
    entry = db.scalar(select(model).where(model.id == entry_id, model.category_id == category.id))
    if entry is None:
        raise ValidationError(f"El {label} elegido no pertenece a «{category.name}».")
    # Uno desactivado solo se acepta si el registro ya lo tenía (datos viejos).
    if not entry.is_active and entry.id != previous_id:
        raise ValidationError(f"El {label} «{entry.name}» está desactivado.")


def validate_category_path(
    db: Session,
    household_id: uuid.UUID,
    *,
    category_id: uuid.UUID,
    item_id: uuid.UUID | None,
    category_type_id: uuid.UUID | None,
    previous: _HasCategoryPath | None = None,
) -> Category:
    """Verifica que la categoría sea del hogar y que el elemento y el tipo correspondan a su
    estructura. `previous` es el registro que se edita: lo que ya tenía se acepta aunque hoy
    esté desactivado. Los mensajes se muestran tal cual al usuario."""
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.household_id == household_id)
    )
    if category is None:
        raise ValidationError("La categoría elegida no existe.")
    if not category.is_active and (previous is None or previous.category_id != category.id):
        raise ValidationError("La categoría elegida está desactivada.")

    same_category = previous is not None and previous.category_id == category.id
    _check_entry(
        db,
        CategoryItem,
        item_id,
        category,
        required=category.structure in USES_ITEMS,
        previous_id=previous.item_id if same_category else None,
        missing=f"Elegí qué {(category.item_label or 'elemento').lower()}.",
        label="elemento",
    )
    _check_entry(
        db,
        CategoryType,
        category_type_id,
        category,
        required=category.structure in USES_TYPES,
        previous_id=previous.category_type_id if same_category else None,
        missing="Elegí un tipo.",
        label="tipo",
    )
    return category


# --- Categorías ----------------------------------------------------------------------------


def _ensure_category_name_free(
    db: Session, household_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None
) -> None:
    query = select(Category.id).where(
        Category.household_id == household_id, func.lower(Category.name) == name.lower()
    )
    if exclude:
        query = query.where(Category.id != exclude)
    if db.scalar(query):
        raise ConflictError(f"Ya existe una categoría llamada «{name}».")


def create_category(
    db: Session,
    admin: User,
    *,
    name: str,
    structure: CategoryStructure,
    item_label: str | None = None,
) -> Category:
    _ensure_category_name_free(db, admin.household_id, name)
    category = Category(
        household_id=admin.household_id,
        name=name,
        structure=structure,
        # Si no se indica, cada elemento se llama como la categoría (ej. "Auto").
        item_label=(item_label or name) if structure in USES_ITEMS else None,
    )
    db.add(category)
    db.flush()
    audit.record(
        db,
        "category.created",
        actor=admin,
        entity_type="category",
        entity_id=category.id,
        details={"name": name, "structure": structure.value},
    )
    db.commit()
    return category


def update_category(
    db: Session, admin: User, category_id: uuid.UUID, changes: dict[str, object]
) -> Category:
    category = get_category(db, admin.household_id, category_id)
    if "name" in changes:
        _ensure_category_name_free(
            db, admin.household_id, str(changes["name"]), exclude=category.id
        )
    if "structure" in changes and changes["structure"] != category.structure:
        used = db.scalar(select(Transaction.id).where(Transaction.category_id == category.id))
        if used:
            raise ConflictError(
                "No se puede cambiar la estructura de una categoría que ya tiene pagos. "
                "Creá una categoría nueva con la estructura que necesitás."
            )
        if changes["structure"] in USES_ITEMS and not (
            changes.get("item_label") or category.item_label
        ):
            changes["item_label"] = category.name
    _apply_and_audit(db, admin, category, "category", changes)
    return category


# --- Tipos y elementos ---------------------------------------------------------------------

_KINDS = {
    "type": (CategoryType, USES_TYPES, "tipo", "Esta categoría no usa tipos."),
    "item": (CategoryItem, USES_ITEMS, "elemento", "Esta categoría no usa elementos."),
}


def _ensure_entry_name_free(
    db: Session, model: type, category_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None
) -> None:
    query = select(model.id).where(
        model.category_id == category_id, func.lower(model.name) == name.lower()
    )
    if exclude:
        query = query.where(model.id != exclude)
    if db.scalar(query):
        raise ConflictError(f"Ya existe «{name}» en esta categoría.")


def create_entry(
    db: Session, admin: User, kind: str, category_id: uuid.UUID, name: str
) -> CategoryType | CategoryItem:
    model, allowed, label, not_allowed = _KINDS[kind]
    category = get_category(db, admin.household_id, category_id)
    if category.structure not in allowed:
        raise ValidationError(not_allowed)
    _ensure_entry_name_free(db, model, category.id, name)
    entry = model(household_id=admin.household_id, category_id=category.id, name=name)
    db.add(entry)
    db.flush()
    audit.record(
        db,
        f"category_{kind}.created",
        actor=admin,
        entity_type=f"category_{kind}",
        entity_id=entry.id,
        details={"name": name, "category": category.name},
    )
    db.commit()
    return entry


def update_entry(
    db: Session, admin: User, kind: str, entry_id: uuid.UUID, changes: dict[str, object]
) -> CategoryType | CategoryItem:
    model, _, label, _ = _KINDS[kind]
    entry = db.scalar(
        select(model).where(model.id == entry_id, model.household_id == admin.household_id)
    )
    if entry is None:
        raise NotFoundError(f"No se encontró el {label}.")
    if "name" in changes:
        _ensure_entry_name_free(
            db, model, entry.category_id, str(changes["name"]), exclude=entry.id
        )
    _apply_and_audit(db, admin, entry, f"category_{kind}", changes)
    return entry


def _apply_and_audit(
    db: Session, admin: User, entity: object, entity_type: str, changes: dict[str, object]
) -> None:
    changed = {
        field: {"from": str(getattr(entity, field)), "to": str(value)}
        for field, value in changes.items()
        if getattr(entity, field) != value
    }
    for field, value in changes.items():
        setattr(entity, field, value)
    if changed:
        audit.record(
            db,
            f"{entity_type}.updated",
            actor=admin,
            entity_type=entity_type,
            entity_id=entity.id,  # type: ignore[attr-defined]
            details={"name": entity.name, **changed},  # type: ignore[attr-defined]
        )
    db.commit()
