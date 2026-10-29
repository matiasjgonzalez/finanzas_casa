import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import CategoryStructure

CatalogName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
ItemLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class CatalogEntryOut(BaseModel):
    """Tipo o elemento de una categoría."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    structure: CategoryStructure
    item_label: str | None
    is_active: bool
    types: list[CatalogEntryOut]
    items: list[CatalogEntryOut]


class CategoryCreate(BaseModel):
    name: CatalogName
    structure: CategoryStructure = CategoryStructure.SIMPLE
    item_label: ItemLabel | None = None


class CategoryUpdate(BaseModel):
    name: CatalogName | None = None
    structure: CategoryStructure | None = None
    item_label: ItemLabel | None = None
    is_active: bool | None = None

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True, exclude_none=True)


class CatalogEntryCreate(BaseModel):
    name: CatalogName


class CatalogEntryUpdate(BaseModel):
    name: CatalogName | None = None
    is_active: bool | None = None

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True, exclude_none=True)
