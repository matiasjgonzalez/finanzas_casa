"""Categorías, sus tipos y sus elementos. Consultar: cualquier integrante. Modificar: admin."""

import uuid

from fastapi import APIRouter, Query, status

from app.api.deps import AdminAuth, CurrentAuth, DbSession
from app.core.errors import PermissionDeniedError
from app.models.enums import UserRole
from app.schemas.catalog import (
    CatalogEntryCreate,
    CatalogEntryOut,
    CatalogEntryUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
)
from app.services import catalog

router = APIRouter(tags=["catalog"])


@router.get("/categories")
def list_categories(
    auth: CurrentAuth, db: DbSession, include_inactive: bool = Query(False)
) -> list[CategoryOut]:
    """Categorías con sus tipos y elementos activos (los desactivados, solo para el admin)."""
    if include_inactive and auth.user.role != UserRole.ADMIN:
        raise PermissionDeniedError("Solo un administrador puede ver los elementos desactivados.")
    return catalog.list_categories(db, auth.user.household_id, include_inactive)


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, auth: AdminAuth, db: DbSession) -> CategoryOut:
    category = catalog.create_category(
        db, auth.user, name=body.name, structure=body.structure, item_label=body.item_label
    )
    return catalog.category_out(db, category)


@router.patch("/categories/{category_id}")
def update_category(
    category_id: uuid.UUID, body: CategoryUpdate, auth: AdminAuth, db: DbSession
) -> CategoryOut:
    category = catalog.update_category(db, auth.user, category_id, body.changes())
    return catalog.category_out(db, category)


@router.post("/categories/{category_id}/types", status_code=status.HTTP_201_CREATED)
def create_type(
    category_id: uuid.UUID, body: CatalogEntryCreate, auth: AdminAuth, db: DbSession
) -> CatalogEntryOut:
    entry = catalog.create_entry(db, auth.user, "type", category_id, body.name)
    return CatalogEntryOut.model_validate(entry)


@router.patch("/category-types/{type_id}")
def update_type(
    type_id: uuid.UUID, body: CatalogEntryUpdate, auth: AdminAuth, db: DbSession
) -> CatalogEntryOut:
    entry = catalog.update_entry(db, auth.user, "type", type_id, body.changes())
    return CatalogEntryOut.model_validate(entry)


@router.post("/categories/{category_id}/items", status_code=status.HTTP_201_CREATED)
def create_item(
    category_id: uuid.UUID, body: CatalogEntryCreate, auth: AdminAuth, db: DbSession
) -> CatalogEntryOut:
    entry = catalog.create_entry(db, auth.user, "item", category_id, body.name)
    return CatalogEntryOut.model_validate(entry)


@router.patch("/category-items/{item_id}")
def update_item(
    item_id: uuid.UUID, body: CatalogEntryUpdate, auth: AdminAuth, db: DbSession
) -> CatalogEntryOut:
    entry = catalog.update_entry(db, auth.user, "item", item_id, body.changes())
    return CatalogEntryOut.model_validate(entry)
