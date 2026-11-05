"""Copias de seguridad: la base de datos y los comprobantes, juntos en un solo archivo .zip.

Uso (desde la carpeta backend, con el entorno virtual activado):

    python -m app.backup crear                       (crea una copia ahora)
    python -m app.backup automatico                  (crea una si la última tiene más de un día)
    python -m app.backup listar                      (muestra las copias guardadas)
    python -m app.backup verificar ARCHIVO           (comprueba que una copia se pueda leer)
    python -m app.backup restaurar ARCHIVO --confirmar

Con --nube (ej. "python -m app.backup --nube crear") se trabaja sobre la base del servidor en
internet (CLOUD_DATABASE_URL) en lugar de la de esta PC; esas copias van a BACKUP_DIR/nube y se
guardan CIFRADAS (.cifrado) con BACKUP_PUBLIC_KEY: solo las abre la clave privada.

    python -m app.backup clave-nueva                 (crea las claves; ver backup_crypto.py)
    python -m app.backup descifrar ARCHIVO           (deja el .zip al lado de la copia cifrada)

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
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from app import backup_crypto
from app.core.config import get_settings

PREFIX = "respaldo_"
DUMP_NAME = "base.dump"
FILES_DIR = "comprobantes"
INFO_NAME = "resumen.json"
ENCRYPTED_SUFFIX = ".cifrado"
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
    """Copias del directorio (.zip y .cifrado), de la más nueva a la más vieja."""
    result = []
    for path in directory.glob(f"{PREFIX}*"):
        if path.suffix not in (".zip", ENCRYPTED_SUFFIX):
            continue
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
    url: str,
    storage: Path | None,
    directory: Path,
    keep: int,
    *,
    now: datetime | None = None,
    public_key: str | None = None,
) -> Path:
    """storage: la carpeta de comprobantes, o None si se guardan en la base.
    public_key: si se indica, la copia se verifica y después se guarda CIFRADA (.cifrado)."""
    now = now or datetime.now()
    directory.mkdir(parents=True, exist_ok=True)
    # Nunca se pisa una copia existente (dos copias en el mismo segundo llevan -2, -3…).
    base = f"{PREFIX}{now:%Y-%m-%d_%H%M%S}"
    suffix = ENCRYPTED_SUFFIX if public_key else ".zip"
    stem, number = base, 1
    while any((directory / f"{stem}{s}").exists() for s in (".zip", ENCRYPTED_SUFFIX)):
        number += 1
        stem = f"{base}-{number}"
    target = directory / f"{stem}{suffix}"
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
        partial = directory / f"{stem}.zip.parcial"
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(dump, DUMP_NAME)
            archive.writestr(INFO_NAME, json.dumps(info, indent=2, ensure_ascii=False))
            if storage and storage.is_dir():
                for file in sorted(storage.rglob("*")):
                    if file.is_file():
                        archive.write(file, f"{FILES_DIR}/{file.relative_to(storage).as_posix()}")
        if public_key:
            # Se verifica ANTES de cifrar (después, sin la clave privada, ya no se podría).
            try:
                verify(partial)
                encrypted = directory / f"{stem}{ENCRYPTED_SUFFIX}.parcial"
                encrypted.write_bytes(backup_crypto.encrypt(partial.read_bytes(), public_key))
            except backup_crypto.CryptoError as error:
                raise BackupError(str(error)) from error
            finally:
                partial.unlink(missing_ok=True)
            partial = encrypted
        # Recién completo recibe su nombre final: nunca queda una copia a medias que parezca
        # buena.
        partial.replace(target)
    rotate(directory, keep)
    return target


def needs_backup(directory: Path, *, now: datetime | None = None) -> bool:
    backups = list_backups(directory)
    return not backups or (now or datetime.now()) - backups[0].created > timedelta(days=1)


# --- Verificar y restaurar -----------------------------------------------------------------


@contextmanager
def opened(path: Path, private_key: str | None) -> Iterator[Path]:
    """La copia como .zip: tal cual, o descifrada en una carpeta temporal (que se borra)."""
    if not path.is_file():
        raise BackupError(f"No existe el archivo {path}.")
    if not backup_crypto.is_encrypted(path):
        yield path
        return
    if not private_key:
        raise BackupError(
            "Esta copia está cifrada: para abrirla hace falta la clave privada "
            f"(archivo {get_settings().backup_private_key_file})."
        )
    try:
        data = backup_crypto.decrypt(path.read_bytes(), private_key)
    except backup_crypto.CryptoError as error:
        raise BackupError(str(error)) from error
    with tempfile.TemporaryDirectory(prefix="ff-descifrar-") as work:
        plain = Path(work) / f"{path.stem}.zip"
        plain.write_bytes(data)
        yield plain


def verify(path: Path, private_key: str | None = None) -> dict[str, object]:
    """Comprueba que la copia esté sana y que pg_restore pueda leer la base."""
    with opened(path, private_key) as plain:
        info = _verify_zip(plain)
    info["cifrada"] = plain != path
    return info


def _verify_zip(path: Path) -> dict[str, object]:
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


def restore(
    url: str,
    storage: Path | None,
    directory: Path,
    keep: int,
    path: Path,
    *,
    private_key: str | None = None,
    public_key: str | None = None,
) -> Path:
    """Reemplaza la base y los comprobantes por los de la copia. Antes guarda una copia del
    estado actual (por si se eligió el archivo equivocado). Devuelve esa copia de seguridad.
    private_key abre una copia cifrada; public_key cifra la copia del estado actual."""
    args, env = _connection(url)
    with tempfile.TemporaryDirectory(prefix="ff-restaurar-") as work:
        # Primero se lee la copia elegida; recién después se guarda el estado actual (así la
        # copia de seguridad previa nunca puede afectar a la que se restaura).
        with opened(path, private_key) as plain:
            _verify_zip(plain)
            with zipfile.ZipFile(plain) as archive:
                archive.extractall(work)
        safety = create(url, storage, directory, keep + 1, public_key=public_key)
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


def _read_private_key(path: Path) -> str | None:
    return path.read_text(encoding="utf-8").strip() if path.is_file() else None


def _new_keys(path: Path) -> int:
    """Crea el par de claves. Nunca pisa una clave existente: sin ella no se abrirían las copias
    ya hechas."""
    if path.exists():
        raise BackupError(
            f"Ya hay una clave privada en {path}. Si la reemplazás, las copias hechas con ella no "
            "se podrían abrir: si de verdad querés otra, mové antes ese archivo a otro lugar."
        )
    public, private = backup_crypto.new_key_pair()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(private + "\n", encoding="utf-8")
    print(f"Clave PRIVADA guardada en: {path}")
    print("  Copiala YA a un pendrive (y guardalo en un lugar seguro). Sin ella, las copias")
    print("  cifradas no se pueden abrir: ni vos ni nadie. No la subas a ningún lado.\n")
    print("Clave PÚBLICA (no es secreta, solo sirve para cifrar). Cargala en:")
    print("  - GitHub: Settings → Secrets and variables → Actions → BACKUP_PUBLIC_KEY")
    print("  - el archivo .env de esta PC: BACKUP_PUBLIC_KEY=<la clave>\n")
    print(f"  {public}")
    return 0


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
    commands.add_parser("clave-nueva", help="Crear las claves para cifrar las copias de internet")
    open_ = commands.add_parser("descifrar", help="Abrir una copia cifrada (deja el .zip al lado)")
    open_.add_argument("archivo", type=Path)
    args = parser.parse_args(argv)

    settings = get_settings()
    private_key = _read_private_key(settings.backup_private_key_file)
    try:
        if args.command == "clave-nueva":
            return _new_keys(settings.backup_private_key_file)
        if args.command == "descifrar":
            with opened(args.archivo, private_key) as plain:
                if plain == args.archivo:
                    raise BackupError("Esa copia no está cifrada: se abre directamente.")
                target = args.archivo.with_suffix(".zip")
                shutil.copyfile(plain, target)
            print(f"Listo: {target}")
            return 0
    except BackupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    url, directory, keep = settings.database_url, settings.backup_dir, settings.backup_keep
    storage = settings.storage_dir if settings.storage_backend == "local" else None
    public_key = None
    if args.nube:
        # Las copias de la base de internet se guardan siempre cifradas (van a GitHub).
        public_key = settings.backup_public_key
        if not public_key and args.command in ("crear", "automatico", "restaurar"):
            print(
                "Error: falta BACKUP_PUBLIC_KEY. Las copias de la base de internet se guardan "
                "cifradas: creá las claves con «respaldo-nube clave-nueva» (ver README).",
                file=sys.stderr,
            )
            return 1
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
            path = create(url, storage, directory, keep, public_key=public_key)
            print(f"Copia de seguridad creada: {path.name}")
            return 0
        if args.command == "crear":
            path = create(url, storage, directory, keep, public_key=public_key)
            print(f"Listo: {path}  ({_size(path.stat().st_size)})")
            if public_key and not private_key:
                # Por ejemplo, en GitHub: se verificó antes de cifrar y la clave privada no está.
                print("  Verificada y cifrada (solo se abre con la clave privada).")
            else:
                info = verify(path, private_key)
                print(f"  Registros: {info['registros']}  ·  comprobantes: {info['comprobantes']}")
                if info["cifrada"]:
                    print("  Cifrada: solo se abre con la clave privada.")
            print(f"  Se conservan las últimas {keep} copias en {directory}.")
            return 0
        if args.command == "verificar":
            info = verify(args.archivo, private_key)
            print(f"La copia está sana. Creada el {info['creado']}.")
            print(f"  Registros: {info['registros']}  ·  comprobantes: {info['comprobantes']}")
            return 0
        if args.command == "restaurar":
            info = verify(args.archivo, private_key)
            if not args.confirmar:
                print(
                    "Esto REEMPLAZA todos los datos actuales por los de la copia del "
                    f"{info['creado']}.\nAntes se guarda una copia del estado actual. Para "
                    "continuar, repetí el comando agregando --confirmar."
                )
                return 1
            if not args.nube and app_running():
                raise BackupError("Cerrá la aplicación (dev.cmd o prod.cmd) antes de restaurar.")
            safety = restore(
                url,
                storage,
                directory,
                keep,
                args.archivo,
                private_key=private_key,
                public_key=public_key,
            )
            print(f"Listo: se restauró la copia del {info['creado']}.")
            print(f"  El estado anterior quedó guardado en {safety}.")
            return 0
    except BackupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
