"""Almacenamiento en una carpeta local privada (fuera de los archivos públicos del frontend)."""

import os
import tempfile
from pathlib import Path

from app.storage.base import StorageError, validate_key


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / validate_key(key)).resolve()
        # Defensa adicional: la ruta final tiene que quedar dentro de la carpeta raíz.
        if not path.is_relative_to(self.root):
            raise StorageError("Ruta fuera del almacenamiento")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Se escribe en un archivo temporal y después se renombra: nunca queda un archivo a medias.
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".subiendo-")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def read(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError as error:
            raise StorageError("El archivo no existe en el almacenamiento") from error

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
