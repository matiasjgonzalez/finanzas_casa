from datetime import datetime

from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StoredFile(Base):
    """El contenido de un comprobante, guardado en la propia base (ver DatabaseStorage).

    Va en una tabla aparte de "attachments" para que listar comprobantes no traiga los archivos.
    """

    __tablename__ = "stored_files"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
