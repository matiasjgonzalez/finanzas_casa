"""Copias de seguridad: nombres, rotación y validación de archivos.

La ida y vuelta completa con pg_dump/pg_restore se prueba aparte sobre la base _test (restaurar
reemplaza la base entera, no se puede hacer dentro de la transacción de cada prueba).
"""

import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app import backup


def fake(directory: Path, name: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_bytes(b"x")
    return path


def test_lists_newest_first_and_ignores_other_files(tmp_path: Path) -> None:
    fake(tmp_path, "respaldo_2026-10-01_080000.zip")
    fake(tmp_path, "respaldo_2026-10-03_080000.zip")
    fake(tmp_path, "respaldo_2026-10-03_080000-2.zip")  # dos en el mismo segundo
    fake(tmp_path, "mis-fotos.zip")
    fake(tmp_path, "respaldo_roto.zip")

    names = [b.path.name for b in backup.list_backups(tmp_path)]

    assert names == [
        "respaldo_2026-10-03_080000-2.zip",
        "respaldo_2026-10-03_080000.zip",
        "respaldo_2026-10-01_080000.zip",
    ]


def test_rotation_keeps_the_newest_and_never_touches_other_files(tmp_path: Path) -> None:
    for day in range(1, 6):
        fake(tmp_path, f"respaldo_2026-10-0{day}_080000.zip")
    mine = fake(tmp_path, "importante.zip")

    removed = backup.rotate(tmp_path, keep=2)

    assert [b.path.name for b in backup.list_backups(tmp_path)] == [
        "respaldo_2026-10-05_080000.zip",
        "respaldo_2026-10-04_080000.zip",
    ]
    assert len(removed) == 3
    assert mine.exists()


def test_automatic_backup_once_a_day(tmp_path: Path) -> None:
    now = datetime(2026, 10, 28, 9, 0)
    assert backup.needs_backup(tmp_path, now=now)  # no hay ninguna
    fake(tmp_path, "respaldo_2026-10-28_080000.zip")
    assert not backup.needs_backup(tmp_path, now=now)
    assert backup.needs_backup(tmp_path, now=now + timedelta(days=1, hours=1))


def test_verify_rejects_files_that_are_not_backups(tmp_path: Path) -> None:
    other = tmp_path / "otro.zip"
    with zipfile.ZipFile(other, "w") as archive:
        archive.writestr("foto.jpg", b"...")
    broken = tmp_path / "roto.zip"
    broken.write_bytes(b"esto no es un zip")

    with pytest.raises(backup.BackupError, match="no es una copia"):
        backup.verify(other)
    with pytest.raises(backup.BackupError, match="dañado"):
        backup.verify(broken)
    with pytest.raises(backup.BackupError, match="No existe"):
        backup.verify(tmp_path / "no-existe.zip")


def test_finds_postgres_tools() -> None:
    assert Path(backup.pg_tool("pg_dump")).name.startswith("pg_dump")


def test_encrypted_connections_reach_pg_dump() -> None:
    """Neon exige SSL: la opción de la dirección llega a pg_dump (sin poner la contraseña en la
    línea de comandos)."""
    args, env = backup._connection(
        "postgresql+psycopg://ana:secreta@ep-x.neon.tech/casa?sslmode=require&channel_binding=require"
    )
    assert env["PGSSLMODE"] == "require"
    assert env["PGCHANNELBINDING"] == "require"
    assert env["PGPASSWORD"] == "secreta"
    assert "secreta" not in " ".join(args)


def test_cloud_backups_need_the_cloud_address(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "cloud_database_url", None)

    assert backup.main(["--nube", "listar"]) == 1
    assert "CLOUD_DATABASE_URL" in capsys.readouterr().err


def test_summary_skips_tables_not_created_yet(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La copia diaria se hace antes de las migraciones: una tabla nueva puede no existir."""
    monkeypatch.setattr(backup, "COUNTED", ["households", "tabla_de_una_version_futura"])

    summary = backup._summary(database_url)

    assert list(summary["registros"]) == ["households"]
