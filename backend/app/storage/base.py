"""Interfaz de almacenamiento de archivos.

La lógica del negocio solo conoce esta interfaz. Hay dos: DatabaseStorage (en la propia base, la
opción por defecto) y LocalStorage (una carpeta privada). Para usar un servicio compatible con S3
alcanza con escribir otra clase con estos tres métodos.
"""

import re
from typing import Protocol

# Las claves las genera siempre el servidor: "<id del hogar>/<id aleatorio>.<extensión>".
# Validarlas impide rutas arbitrarias como "../../windows/system32".
KEY_PATTERN = re.compile(r"^[0-9a-f-]{36}/[0-9a-f]{32}\.(pdf|jpg|png|webp)$")


class StorageError(Exception):
    pass


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...

    def read(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...


def validate_key(key: str) -> str:
    if not KEY_PATTERN.fullmatch(key):
        raise StorageError("Clave de archivo inválida")
    return key
