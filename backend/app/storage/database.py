"""Almacenamiento dentro de la propia base de datos (tabla stored_files).

Sirve en servidores sin disco permanente (como el plan gratis de Render): los comprobantes
quedan junto a los datos y una copia de la base los incluye.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import StoredFile
from app.storage.base import StorageError, validate_key


class DatabaseStorage:
    def __init__(self, db: Session) -> None:
        # La misma sesión de la petición: el archivo se guarda en el mismo commit que su
        # comprobante, así nunca queda uno sin el otro.
        self.db = db

    def save(self, key: str, data: bytes) -> None:
        self.db.add(StoredFile(key=validate_key(key), data=data))
        self.db.flush()

    def read(self, key: str) -> bytes:
        data = self.db.scalar(select(StoredFile.data).where(StoredFile.key == validate_key(key)))
        if data is None:
            raise StorageError("El archivo no existe en el almacenamiento")
        return data

    def delete(self, key: str) -> None:
        # Se llama después del commit que borró el comprobante: este borrado va en el suyo.
        self.db.execute(delete(StoredFile).where(StoredFile.key == validate_key(key)))
        self.db.commit()
