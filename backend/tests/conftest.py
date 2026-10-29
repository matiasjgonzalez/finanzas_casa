"""Configuración común de las pruebas.

- Usan una base PostgreSQL REAL y separada (TEST_DATABASE_URL), nunca la de desarrollo.
- Al iniciar, la base se reconstruye aplicando las migraciones de Alembic desde cero.
- Cada prueba corre dentro de una transacción que se revierte al final: no deja datos.
"""

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from alembic import command
from app.api.deps import get_storage
from app.core.config import PROJECT_ROOT, get_settings
from app.core.database import get_db
from app.main import app
from app.storage import LocalStorage

BACKEND_DIR = PROJECT_ROOT / "backend"


def _test_database_url() -> str:
    url = get_settings().test_database_url
    if not url:
        pytest.exit("Falta TEST_DATABASE_URL en el archivo .env", returncode=2)
    # Protección: las pruebas borran la base. Solo se permite una cuyo nombre termine en _test.
    database = make_url(url).database or ""
    if not database.endswith("_test"):
        pytest.exit(f"TEST_DATABASE_URL apunta a '{database}', que no termina en _test", 2)
    return url


def alembic_config(url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    return config


@pytest.fixture(scope="session")
def database_url() -> str:
    return _test_database_url()


@pytest.fixture(scope="session")
def engine(database_url: str) -> Iterator[Engine]:
    engine = create_engine(database_url)
    # Base de pruebas desde cero, aunque haya quedado con datos (por ejemplo, de una prueba
    # manual): se borra el esquema completo y se aplican todas las migraciones. Es seguro porque
    # _test_database_url() solo permite bases cuyo nombre termina en _test.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    command.upgrade(alembic_config(database_url), "head")
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Sesión dentro de una transacción externa que se revierte al terminar la prueba.

    create_savepoint: los commit() del código bajo prueba se convierten en SAVEPOINTs,
    así la prueba puede ejercitar commits reales sin dejar datos.
    """
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def storage(tmp_path: Path) -> LocalStorage:
    """Almacenamiento de comprobantes en una carpeta temporal propia de cada prueba."""
    return LocalStorage(tmp_path / "storage")


@pytest.fixture
def client_factory(db: Session, storage: LocalStorage) -> Iterator[Callable[[], TestClient]]:
    """Crea clientes HTTP independientes (cada uno con sus cookies, como navegadores distintos)."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    clients: list[TestClient] = []

    def make() -> TestClient:
        test_client = TestClient(app)
        clients.append(test_client)
        return test_client

    yield make
    for test_client in clients:
        test_client.close()
    app.dependency_overrides.clear()


@pytest.fixture
def client(client_factory: Callable[[], TestClient]) -> TestClient:
    return client_factory()
