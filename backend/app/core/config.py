"""Configuración de la aplicación, leída desde variables de entorno o desde el archivo .env."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Raíz del repositorio (…/movimientos). El .env y la carpeta storage viven allí.
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"

    # Sin valor por defecto: si falta, la aplicación no arranca (en vez de conectarse a otra base).
    database_url: str
    test_database_url: str | None = None
    # La base del servidor en internet (ej. Neon). Solo la usa tu PC para bajar copias de
    # seguridad de esa base (respaldo-nube.cmd); el servidor no la necesita.
    cloud_database_url: str | None = None

    # NoDecode: se recibe como texto "a,b,c" y lo separamos nosotros, en lugar de esperar JSON.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # Dónde se guardan los comprobantes: "database" (en la propia base; sirve en servidores sin
    # disco permanente, como el plan gratis de Render) o "local" (en la carpeta storage_dir).
    storage_backend: Literal["database", "local"] = "database"
    storage_dir: Path = Path("storage")
    # Copias de seguridad (python -m app.backup): dónde se guardan y cuántas se conservan.
    backup_dir: Path = Path("respaldos")
    backup_keep: int = Field(default=30, ge=1, le=365)
    # Frontend compilado (npm run build). Si existe, la API también sirve la aplicación web.
    frontend_dist: Path = Path("frontend/dist")
    max_upload_mb: int = Field(default=10, ge=1, le=100)

    # Detrás de un proxy (ej. Railway) la conexión llega desde el proxy: la IP real de cada
    # persona viene en un encabezado. Activarlo SOLO detrás de un proxy (si no, cualquiera
    # podría inventar su IP y esquivar el bloqueo por intentos fallidos).
    trust_proxy: bool = False

    # Sesiones: duran session_days desde la última actividad.
    session_days: int = Field(default=14, ge=1, le=90)
    # Protección contra fuerza bruta en el inicio de sesión.
    login_max_failures_per_username: int = 5
    login_max_failures_per_ip: int = 20
    login_window_minutes: int = 15

    @field_validator("database_url", "test_database_url", "cloud_database_url", mode="before")
    @classmethod
    def use_psycopg_driver(cls, value: object) -> object:
        # Railway, Neon y otros servicios entregan "postgresql://…" o "postgres://…"; SQLAlchemy
        # necesita saber que se usa el driver psycopg 3.
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("storage_dir", "frontend_dist", "backup_dir")
    @classmethod
    def resolve_from_project_root(cls, value: Path) -> Path:
        # Las rutas relativas se interpretan desde la raíz del proyecto, no desde donde se ejecuta.
        return value if value.is_absolute() else (PROJECT_ROOT / value).resolve()

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cookie_secure(self) -> bool:
        # En producción las cookies solo viajan por HTTPS. En desarrollo se usa http://localhost.
        return self.is_production

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
