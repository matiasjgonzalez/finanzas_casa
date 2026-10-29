"""Categorías de pagos, configurables por el administrador de cada hogar.

Jerarquía:
- Category: "Tarjeta de crédito", "Servicio", "Auto", "Supermercado"…
- CategoryType: tipos dentro de una categoría ("Visa", "Luz", "Seguro"…).
- CategoryItem: elementos de una categoría ("Fiat Cronos", "Ford Ka"…). Solo en categorías
  con estructura ITEMS_AND_TYPES; los tipos de la categoría sirven para todos sus elementos.
"""

import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import CategoryStructure, str_enum


class Category(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "categories"
    # Permite que otras tablas exijan "categoría de ESTE hogar" con una FK compuesta.
    __table_args__ = (UniqueConstraint("household_id", "id"),)

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(String(60))
    structure: Mapped[CategoryStructure] = mapped_column(
        str_enum(CategoryStructure, "category_structure"),
        default=CategoryStructure.SIMPLE,
        server_default=CategoryStructure.SIMPLE.value,
    )
    # Cómo se llama cada elemento (ej. "Auto"). Solo en estructura ITEMS_AND_TYPES.
    item_label: Mapped[str | None] = mapped_column(String(40))
    color: Mapped[str | None] = mapped_column(String(7))  # "#RRGGBB"
    icon: Mapped[str | None] = mapped_column(String(40))  # nombre de ícono de lucide-react
    # Las categorías usadas no se borran: se desactivan para no romper el historial.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


# No puede haber dos categorías con igual nombre en un hogar ("Auto" = "auto").
Index(
    "uq_categories_household_name",
    Category.household_id,
    func.lower(Category.name),
    unique=True,
)


class _CategoryChild(UUIDPrimaryKey, Timestamps):
    """Columnas comunes de tipos y elementos: pertenecen a una categoría del mismo hogar."""

    household_id: Mapped[uuid.UUID] = mapped_column()
    category_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(60))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class CategoryType(_CategoryChild, Base):
    __tablename__ = "category_types"
    __table_args__ = (
        ForeignKeyConstraint(
            ["household_id", "category_id"],
            ["categories.household_id", "categories.id"],
            ondelete="RESTRICT",
        ),
        # Permite exigir "tipo de ESTA categoría" desde los movimientos.
        UniqueConstraint("category_id", "id"),
    )


Index(
    "uq_category_types_category_name",
    CategoryType.category_id,
    func.lower(CategoryType.name),
    unique=True,
)


class CategoryItem(_CategoryChild, Base):
    __tablename__ = "category_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["household_id", "category_id"],
            ["categories.household_id", "categories.id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("category_id", "id"),
    )


Index(
    "uq_category_items_category_name",
    CategoryItem.category_id,
    func.lower(CategoryItem.name),
    unique=True,
)
