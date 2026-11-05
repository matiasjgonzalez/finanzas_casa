"""Copias de seguridad: la base de datos y los comprobantes, juntos en un solo archivo .zip.

Uso (desde la carpeta backend, con el entorno virtual activado):

    python -m app.backup crear                       (crea una copia ahora)
    python -m app.backup automatico                  (crea una si la última tiene más de un día)
    python -m app.backup listar                      (muestra las copias guardadas)
    python -m app.backup verificar ARCHIVO           (comprueba que una copia se pueda leer)
    python -m app.backup restaurar ARCHIVO --confirmar

Con --nube (ej. "python -m app.backup --nube crear") se trabaja sobre la base del servidor en
internet (CLOUD_DATABASE_URL) en lugar de la de esta PC; esas copias van a BACKUP_DIR/nube.

Cada copia es un .zip con: la base (formato de pg_dump), la carpeta de comprobantes (si se
guardan en una carpeta, STORAGE_BACKEND=local; si no, ya están dentro de la base) y un resumen
(fecha, versión del esquema y cantidad de registros). Se guardan en BACKUP_DIR y se conservan
las últimas BACKUP_KEEP. Las dos partes se toman juntas: una base sin sus comprobantes (o al
revés) no sirve para recuperar todo.
"""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from app.core.config import get_settings

PREFIX = "respaldo_"
DUMP_NAME = "base.dump"
FILES_DIR = "comprobantes"
INFO_NAME = "resumen.json"
# Tablas que se cuentan en el resumen (para saber qué tiene cada copia sin abrirla).
COUNTED = [
    "households",
    "users",
    "transactions",
    "attachments",
    "stored_files",
    "services",
    "budgets",
]
# respaldo_2026-10-28_153558.zip (o …_153558-2.zip si ya había una en ese mismo segundo)
NAME = re.compile(rf"^{PREFIX}(\d{{4}}-\d{{2}}-\d{{2}}_\d{{6}})(?:-(\d+))?$")


class BackupError(Exception):
    """Error con un mensaje para mostrar tal cual."""


# --- PostgreSQL ----------------------------------------------------------------------------


def pg_tool(name: str) -> str:
    """Ruta de pg_dump / pg_restore: en el PATH o en la instalación estándar de Windows."""
    found = shutil.which(name)
    if found:
        return found
    installs = sorted(
        Path(r"C:\Program Files\PostgreSQL").glob(f"*/bin/{name}.exe"),
        key=lambda p: int(p.parts[-3]) if p.parts[-3].isdigit() else 0,
    )
    if installs:
        return str(installs[-1])
    raise BackupError(f"No se encontró {name}. Instalá PostgreSQL o agregá su carpeta bin al PATH.")


def _connection(url: str) -> tuple[list[str], dict[str, str]]:
    """Argumentos de conexión y entorno (la contraseña va por PGPASSWORD, nunca en la línea
    de comandos, donde la verían otros programas)."""
    parsed: URL = make_url(url)
    args = [
        "-h",
        parsed.host or "localhost",
        "-p",
        str(parsed.port or 5432),
        "-U",
        parsed.username or "",
        "-d",
        parsed.database or "",
    ]
    env = {**os.environ, "PGPASSWORD": parsed.password or ""}
    # Algunos servicios (ej. Neon) exigen conexión cifrada (?sslmode=require en la dirección).
    for option, variable in (("sslmode", "PGSSLMODE"), ("channel_binding", "PGCHANNELBINDING")):
        value = parsed.query.get(option)
        if isinstance(value, str):
            env[variable] = value
    return args, env


def _run(command: list[str], env: dict[str, str], what: str) -> None:
    result = subprocess.run(command, env=env, capture_output=True, text=True)  # noqa: S603
    if result.returncode != 0:
        raise BackupError(f"Falló {what}: {result.stderr.strip()[:500]}")


def _summary(url: str) -> dict[str, object]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            # Solo las tablas que existen: la copia diaria se hace ANTES de aplicar las
            # migraciones, cuando la base todavía puede no tener una tabla nueva.
            existing = {
                t
                for t in COUNTED
                if conn.execute(text("SELECT to_regclass(:t)"), {"t": t}).scalar() is not None
            }
            counts = {
                t: conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()  # noqa: S608
                for t in COUNTED
                if t in existing
            }
            revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    finally:
        engine.dispose()
    return {"revision": revision, "registros": counts}


# --- Crear ---------------------------------------------------------------------------------


@dataclass
class Backup:
    path: Path
    created: datetime
    size: int


def list_backups(directory: Path) -> list[Backup]:
    """Copias del directorio, de la más nueva a la más vieja."""
    result = []
    for path in directory.glob(f"{PREFIX}*.zip"):
        match = NAME.match(path.stem)
        if not match:
            continue  # un archivo con otro nombre: no es nuestro, no se toca
        created = datetime.strptime(match[1], "%Y-%m-%d_%H%M%S")
        result.append((Backup(path, created, path.stat().st_size), int(match[2] or 1)))
    ordered = sorted(result, key=lambda pair: (pair[0].created, pair[1]), reverse=True)
    return [backup for backup, _ in ordered]


def rotate(directory: Path, keep: int) -> list[Path]:
    """Borra las copias más viejas y deja las `keep` más recientes."""
    removed = []
    for old in list_backups(directory)[keep:]:
        old.path.unlink()
        removed.append(old.path)
    return removed


def create(
    url: str, storage: Path | None, directory: Path, keep: int, *, now: datetime | None = None
) -> Path:
    """storage: la carpeta de comprobantes, o None si se guardan en la base."""
    now = now or datetime.now()
    directory.mkdir(parents=True, exist_ok=True)
    # Nunca se pisa una copia existente (dos copias en el mismo segundo llevan -2, -3…).
    stem = f"{PREFIX}{now:%Y-%m-%d_%H%M%S}"
    target = directory / f"{stem}.zip"
    number = 1
    while target.exists():
        number += 1
        target = directory / f"{stem}-{number}.zip"
    args, env = _connection(url)
    with tempfile.TemporaryDirectory(prefix="ff-respaldo-") as work:
        dump = Path(work) / DUMP_NAME
        # -Fc: formato propio de PostgreSQL (comprimido; permite restaurar con pg_restore).
        _run([pg_tool("pg_dump"), *args, "-Fc", "--no-owner", "-f", str(dump)], env, "pg_dump")
        info = {
            "creado": now.isoformat(timespec="seconds"),
            "base": make_url(url).database,
            **_summary(url),
        }
        partial = target.with_suffix(".zip.parcial")
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(dump, DUMP_NAME)
            archive.writestr(INFO_NAME, json.dumps(info, indent=2, ensure_ascii=False))
            if storage and storage.is_dir():
                for file in sorted(storage.rglob("*")):
                    if file.is_file():
                        archive.write(file, f"{FILES_DIR}/{file.relative_to(storage).as_posix()}")
        # Recién completo recibe su nombre final: nunca queda una copia a medias que parezca
        # buena.
        partial.replace(target)
    rotate(directory, keep)
    return target


def needs_backup(directory: Path, *, now: datetime | None = None) -> bool:
    backups = list_backups(directory)
    return not backups or (now or datetime.now()) - backups[0].created > timedelta(days=1)


# --- Verificar y restaurar -----------------------------------------------------------------


def verify(path: Path) -> dict[str, object]:
    """Comprueba que el .zip esté sano y que pg_restore pueda leer la base."""
    if not path.is_file():
        raise BackupError(f"No existe el archivo {path}.")
    if not zipfile.is_zipfile(path):
        raise BackupError("El archivo está dañado o no es una copia (.zip).")
    with zipfile.ZipFile(path) as archive:
        broken = archive.testzip()
        if broken:
            raise BackupError(f"La copia está dañada (archivo {broken}).")
        names = archive.namelist()
        if DUMP_NAME not in names or INFO_NAME not in names:
            raise BackupError("El archivo no es una copia de Casa en Orden.")
        info = json.loads(archive.read(INFO_NAME))
        with tempfile.TemporaryDirectory(prefix="ff-verificar-") as work:
            archive.extract(DUMP_NAME, work)
            result = subprocess.run(  # noqa: S603
                [pg_tool("pg_restore"), "--list", str(Path(work) / DUMP_NAME)],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise BackupError("PostgreSQL no puede leer la base de la copia.")
        # Los de la carpeta (STORAGE_BACKEND=local) más los guardados dentro de la base.
        in_folder = sum(1 for n in names if n.startswith(f"{FILES_DIR}/"))
        info["comprobantes"] = in_folder + info.get("registros", {}).get("stored_files", 0)
    return info


def app_running(port: int = 8000) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def restore(url: str, storage: Path | None, directory: Path, keep: int, path: Path) -> Path:
    """Reemplaza la base y los comprobantes por los de la copia. Antes guarda una copia del
    estado actual (por si se eligió el archivo equivocado). Devuelve esa copia de seguridad."""
    verify(path)
    args, env = _connection(url)
    with tempfile.TemporaryDirectory(prefix="ff-restaurar-") as work:
        # Primero se lee la copia elegida; recién después se guarda el estado actual (así la
        # copia de seguridad previa nunca puede afectar a la que se restaura).
        with zipfile.ZipFile(path) as archive:
            archive.extractall(work)
        safety = create(url, storage, directory, keep + 1)
        # --clean: borra lo actual antes de restaurar; --single-transaction: si algo falla, la
        # base queda exactamente como estaba.
        _run(
            [
                pg_tool("pg_restore"),
                *args,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--single-transaction",
                str(Path(work) / DUMP_NAME),
            ],
            env,
            "pg_restore",
        )
        if storage is None:
            return safety  # los comprobantes venían dentro de la base
        restored = Path(work) / FILES_DIR
        new = storage.with_name(storage.name + ".restaurando")
        shutil.rmtree(new, ignore_errors=True)
        if restored.is_dir():
            shutil.copytree(restored, new)
        else:
            new.mkdir(parents=True)
        old = storage.with_name(storage.name + ".anterior")
        shutil.rmtree(old, ignore_errors=True)
        if storage.exists():
            storage.rename(old)
        new.rename(storage)
        shutil.rmtree(old, ignore_errors=True)
    return safety


# --- Línea de comandos ---------------------------------------------------------------------


def _size(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} MB" if n >= 1024 * 1024 else f"{n / 1024:.0f} KB"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.backup", description=__doc__.split("\n")[0]
    )
    parser.add_argument(
        "--nube",
        action="store_true",
        help="Usar la base del servidor en internet (CLOUD_DATABASE_URL)",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("crear", help="Crear una copia ahora")
    commands.add_parser("automatico", help="Crear una copia si la última tiene más de un día")
    commands.add_parser("listar", help="Mostrar las copias guardadas")
    check = commands.add_parser("verificar", help="Comprobar que una copia se pueda leer")
    check.add_argument("archivo", type=Path)
    back = commands.add_parser("restaurar", help="Volver al estado de una copia")
    back.add_argument("archivo", type=Path)
    back.add_argument(
        "--confirmar", action="store_true", help="Confirma que se reemplazan los datos actuales"
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    url, directory, keep = settings.database_url, settings.backup_dir, settings.backup_keep
    storage = settings.storage_dir if settings.storage_backend == "local" else None
    if args.nube:
        if not settings.cloud_database_url:
            print(
                "Error: falta CLOUD_DATABASE_URL (la dirección de la base en internet; en "
                "Railway, DATABASE_PUBLIC_URL). Ver README, «Copias de seguridad en Railway».",
                file=sys.stderr,
            )
            return 1
        # En el servidor los comprobantes van siempre dentro de la base.
        url, directory, storage = settings.cloud_database_url, directory / "nube", None
    try:
        if args.command == "listar":
            backups = list_backups(directory)
            if not backups:
                print(f"No hay copias en {directory}.")
            for b in backups:
                print(f"  {b.created:%d/%m/%Y %H:%M}   {_size(b.size):>9}   {b.path}")
            return 0
        if args.command == "automatico":
            if not needs_backup(directory):
                print("Copia de seguridad: la última tiene menos de un día.")
                return 0
            path = create(url, storage, directory, keep)
            print(f"Copia de seguridad creada: {path.name}")
            return 0
        if args.command == "crear":
            path = create(url, storage, directory, keep)
            info = verify(path)
            print(f"Listo: {path}  ({_size(path.stat().st_size)})")
            print(f"  Registros: {info['registros']}  ·  comprobantes: {info['comprobantes']}")
            print(f"  Se conservan las últimas {keep} copias en {directory}.")
            return 0
        if args.command == "verificar":
            info = verify(args.archivo)
            print(f"La copia está sana. Creada el {info['creado']}.")
            print(f"  Registros: {info['registros']}  ·  comprobantes: {info['comprobantes']}")
            return 0
        if args.command == "restaurar":
            info = verify(args.archivo)
            if not args.confirmar:
                print(
                    "Esto REEMPLAZA todos los datos actuales por los de la copia del "
                    f"{info['creado']}.\nAntes se guarda una copia del estado actual. Para "
                    "continuar, repetí el comando agregando --confirmar."
                )
                return 1
            if not args.nube and app_running():
                raise BackupError("Cerrá la aplicación (dev.cmd o prod.cmd) antes de restaurar.")
            safety = restore(url, storage, directory, keep, args.archivo)
            print(f"Listo: se restauró la copia del {info['creado']}.")
            print(f"  El estado anterior quedó guardado en {safety}.")
            return 0
    except BackupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
