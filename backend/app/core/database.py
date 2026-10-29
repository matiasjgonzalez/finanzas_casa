"""Conexión a PostgreSQL y sesión de SQLAlchemy por petición."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

# pool_pre_ping: verifica la conexión antes de usarla (evita errores tras reinicios de PostgreSQL).
engine = create_engine(get_settings().database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: abre una sesión por petición y la cierra al terminar.

    Cada servicio decide cuándo hacer commit; si hay un error antes del commit, nada se guarda.
    """
    with SessionLocal() as session:
        yield session
