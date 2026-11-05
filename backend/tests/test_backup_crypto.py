"""Copias cifradas: solo las abre la clave privada, y una copia alterada no se abre."""

from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app import backup, backup_crypto
from app.core.config import get_settings


def test_only_the_private_key_opens_the_data() -> None:
    public, private = backup_crypto.new_key_pair()
    _, other_private = backup_crypto.new_key_pair()

    blob = backup_crypto.encrypt(b"datos del hogar", public)

    assert b"datos del hogar" not in blob
    assert backup_crypto.decrypt(blob, private) == b"datos del hogar"
    with pytest.raises(backup_crypto.CryptoError, match="no corresponde"):
        backup_crypto.decrypt(blob, other_private)
    assert backup_crypto.public_from_private(private) == public


def test_a_tampered_file_does_not_open() -> None:
    public, private = backup_crypto.new_key_pair()
    blob = bytearray(backup_crypto.encrypt(b"datos del hogar", public))
    blob[-5] ^= 1

    with pytest.raises(backup_crypto.CryptoError):
        backup_crypto.decrypt(bytes(blob), private)


@pytest.mark.parametrize("bad", ["", "hola", "casaenorden-publica-abc", "casaenorden-privada-x"])
def test_badly_copied_keys_are_rejected_with_a_clear_message(bad: str) -> None:
    with pytest.raises(backup_crypto.CryptoError, match="Casa en Orden|incompleta"):
        backup_crypto.encrypt(b"x", bad)


def test_new_keys_never_overwrite_an_existing_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    key_file = tmp_path / "clave" / "clave-privada.txt"
    monkeypatch.setattr(get_settings(), "backup_private_key_file", key_file)

    assert backup.main(["clave-nueva"]) == 0
    output = capsys.readouterr().out
    private = key_file.read_text(encoding="utf-8").strip()
    assert backup_crypto.public_from_private(private) in output
    assert private not in output  # la privada no se muestra en pantalla

    assert backup.main(["clave-nueva"]) == 1
    assert "Ya hay una clave privada" in capsys.readouterr().err
    assert key_file.read_text(encoding="utf-8").strip() == private


def test_cloud_backups_refuse_to_run_without_the_public_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "cloud_database_url", settings.test_database_url)
    monkeypatch.setattr(settings, "backup_public_key", None)

    assert backup.main(["--nube", "crear"]) == 1
    assert "falta BACKUP_PUBLIC_KEY" in capsys.readouterr().err


def test_encrypted_backup_round_trip(database_url: str, tmp_path: Path) -> None:
    """Copia cifrada de la base _test: se verifica, no se abre sin la clave y se restaura."""
    assert make_url(database_url).database.endswith("_test")
    public, private = backup_crypto.new_key_pair()
    engine = create_engine(database_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM stored_files"))
            conn.execute(
                text("INSERT INTO stored_files (key, data) VALUES ('cifrada', 'original')")
            )

        path = backup.create(database_url, None, tmp_path, 5, public_key=public)

        assert path.suffix == ".cifrado"
        assert backup_crypto.is_encrypted(path)
        assert [b.path for b in backup.list_backups(tmp_path)] == [path]
        assert not list(tmp_path.glob("*.zip*"))  # no queda ninguna versión sin cifrar
        with pytest.raises(backup.BackupError, match="cifrada"):
            backup.verify(path)
        assert backup.verify(path, private)["registros"]["stored_files"] == 1

        with engine.begin() as conn:
            conn.execute(text("UPDATE stored_files SET data = 'cambiado'"))
        safety = backup.restore(
            database_url, None, tmp_path, 5, path, private_key=private, public_key=public
        )

        assert safety.suffix == ".cifrado"  # la copia del estado anterior, también cifrada
        with engine.connect() as conn:
            assert conn.execute(text("SELECT data FROM stored_files")).scalar() == b"original"
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM stored_files"))
        engine.dispose()
