from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.api.deps import get_storage
from app.core.config import get_settings
from app.models import StoredFile
from app.storage import DatabaseStorage, LocalStorage, StorageError

KEY = "0b6f4c1e-2d0a-4a5e-9a51-3c2f1d0e9b7a/" + "a" * 32 + ".pdf"


@pytest.fixture(params=["database", "local"])
def any_storage(request: pytest.FixtureRequest, db: Session, tmp_path: Path):  # noqa: ANN201
    """Las dos formas de guardar comprobantes se comportan igual."""
    if request.param == "database":
        return DatabaseStorage(db)
    return LocalStorage(tmp_path / "storage")


def test_save_read_and_delete(any_storage) -> None:  # noqa: ANN001
    any_storage.save(KEY, b"%PDF-1.7 contenido")

    assert any_storage.read(KEY) == b"%PDF-1.7 contenido"
    any_storage.delete(KEY)
    with pytest.raises(StorageError):
        any_storage.read(KEY)
    any_storage.delete(KEY)  # borrar algo que ya no está no es un error


@pytest.mark.parametrize("key", ["../../windows/system32.pdf", "otro/archivo.exe", ""])
def test_keys_not_generated_by_the_server_are_rejected(any_storage, key: str) -> None:  # noqa: ANN001
    with pytest.raises(StorageError):
        any_storage.save(key, b"x")
    with pytest.raises(StorageError):
        any_storage.read(key)


def test_database_storage_saves_with_the_same_commit_as_the_attachment(db: Session) -> None:
    """Si el comprobante no llega a guardarse, su archivo tampoco: van en la misma transacción."""
    savepoint = db.begin_nested()
    DatabaseStorage(db).save(KEY, b"%PDF")
    savepoint.rollback()

    assert db.get(StoredFile, KEY) is None


def test_local_storage_stays_inside_its_folder(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path / "storage")
    storage.save(KEY, b"%PDF")

    stored = storage.root / KEY
    assert stored.read_bytes() == b"%PDF"
    assert stored.is_relative_to(storage.root)


def test_the_backend_is_chosen_with_storage_backend(
    db: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    assert get_settings().storage_backend == "database"  # por defecto, en la base
    assert isinstance(get_storage(db), DatabaseStorage)

    monkeypatch.setattr(get_settings(), "storage_backend", "local")
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path)
    assert isinstance(get_storage(db), LocalStorage)
