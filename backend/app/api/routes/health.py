import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


def storage_problem(env: dict[str, str] | None = None) -> str | None:
    """Con los comprobantes en una carpeta (STORAGE_BACKEND=local), en un servidor esa carpeta
    tiene que ser permanente: el disco del contenedor se borra en cada despliegue y se perderían
    sin aviso. En Railway, tiene que estar en un VOLUMEN; en Render gratis no hay disco
    permanente. Devuelve el problema, o None."""
    if get_settings().storage_backend == "database":
        return None  # quedan en la base, junto con todo lo demás
    env = dict(os.environ) if env is None else env
    if env.get("RENDER"):
        return "En Render los comprobantes tienen que ir a la base (STORAGE_BACKEND=database)."
    on_railway = any(
        k in env for k in ("RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID")
    )
    if not on_railway:
        return None  # en tu PC (o en otro servidor) los archivos ya quedan en disco
    mount = env.get("RAILWAY_VOLUME_MOUNT_PATH")
    if not mount:
        return "No hay un volumen conectado: los comprobantes se perderían en cada despliegue."
    if not get_settings().storage_dir.resolve().is_relative_to(Path(mount).resolve()):
        return f"STORAGE_DIR no está dentro del volumen ({mount})."
    return None


@router.get("/ping")
def ping() -> dict[str, str]:
    """Responde sin tocar la base. Sirve para que un servicio externo visite la app cada pocos
    minutos y Render no la duerma, sin despertar también a la base (Neon gratis cuenta las horas
    que la base está despierta)."""
    return {"status": "ok"}


@router.get("/health")
def health(response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    """Indica si la API está activa, si puede comunicarse con PostgreSQL y si los comprobantes
    se guardan en un lugar permanente. Railway no pone en marcha una versión si esto falla."""
    result = {"status": "ok", "database": "ok", "storage": "ok"}
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("La base de datos no responde")
        result.update(status="degraded", database="unavailable")
    problem = storage_problem()
    if problem:
        logger.error("Comprobantes: %s Ver README, sección Railway.", problem)
        result.update(status="degraded", storage="not persistent")
    if result["status"] != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
