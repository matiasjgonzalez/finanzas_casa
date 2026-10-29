"""Pasos previos a cada despliegue en el servidor (Railway los ejecuta antes de poner en marcha
la versión nueva; si algo falla, la versión anterior sigue funcionando):

1. Aplica las migraciones pendientes de la base.
2. Crea el superadmin con SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD si todavía no existe.

Uso:  python -m app.predeploy
"""

import sys
from pathlib import Path

from alembic.config import Config

from alembic import command
from app.cli import create_admin_from_env

BACKEND = Path(__file__).resolve().parents[1]


def main() -> int:
    print("Aplicando migraciones…", flush=True)
    config = Config(str(BACKEND / "alembic.ini"))
    command.upgrade(config, "head")

    from app.core.database import SessionLocal

    return create_admin_from_env(SessionLocal)


if __name__ == "__main__":
    sys.exit(main())
