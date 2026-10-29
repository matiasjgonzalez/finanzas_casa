from pydantic import BaseModel


class Page[T](BaseModel):
    """Respuesta paginada: los elementos de una página y el total para calcular cuántas hay."""

    items: list[T]
    total: int
    page: int
    page_size: int
