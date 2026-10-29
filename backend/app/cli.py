"""Comandos de administración.

Uso (desde la carpeta backend, con el entorno virtual activado):

    python -m app.cli create-admin            (pide los datos por consola)
    python -m app.cli create-admin --default  (usuario admin / contraseña admin)

    python -m app.cli create-admin --desde-entorno
                                              (servidor: SUPERADMIN_USERNAME y SUPERADMIN_PASSWORD)

    python -m app.cli make-superadmin USUARIO (convierte un usuario existente)

create-admin crea el SUPERADMIN, que administra los hogares (no ve sus datos financieros).
En el modo interactivo la contraseña se escribe sin que se vea en pantalla. En el modo
--default la aplicación obliga a cambiarla al ingresar.
"""

import argparse
import getpass
import os
import sys
from collections.abc import Callable
from contextlib import AbstractContextManager

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models import Transaction, User
from app.models.enums import UserRole
from app.schemas.user import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
    Username,
)
from app.services import audit
from app.services.households import create_superadmin, superadmin_exists

_username_adapter = TypeAdapter(Username)


def _ask(input_fn: Callable[[str], str], prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        value = input_fn(f"{prompt}{suffix}: ").strip()
        if value:
            return value
        if default:
            return default
        print("  Este dato es obligatorio.")


def _ask_username(input_fn: Callable[[str], str]) -> str:
    while True:
        value = _ask(input_fn, "Nombre de usuario (para iniciar sesión)")
        try:
            return _username_adapter.validate_python(value)
        except ValidationError:
            print(
                f"  Usá entre {USERNAME_MIN_LENGTH} y {USERNAME_MAX_LENGTH} caracteres: letras sin "
                "acentos, números, punto, guion o guion bajo (sin espacios)."
            )


def _ask_password(getpass_fn: Callable[[str], str]) -> str:
    while True:
        password = getpass_fn(f"Contraseña (mínimo {PASSWORD_MIN_LENGTH} caracteres): ")
        if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
            print(
                f"  La contraseña debe tener entre {PASSWORD_MIN_LENGTH} "
                f"y {PASSWORD_MAX_LENGTH} caracteres."
            )
            continue
        if getpass_fn("Repetí la contraseña: ") != password:
            print("  Las contraseñas no coinciden.")
            continue
        return password


DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin"  # noqa: S105 - contraseña inicial; se exige cambiarla al ingresar


def create_admin(
    session_factory: Callable[[], AbstractContextManager[Session]],
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass.getpass,
    *,
    use_default: bool = False,
) -> int:
    """Crea el superadmin: administra hogares, pero no ve los datos de ninguno.

    Después, desde la sección "Hogares" de la aplicación, crea cada hogar con su administrador.
    """
    with session_factory() as db:
        if superadmin_exists(db):
            print(
                "Ya existe un superadmin. Los hogares y sus usuarios se crean desde la "
                "aplicación (sección Hogares).",
                file=sys.stderr,
            )
            return 1

        if use_default:
            # Usuario admin / contraseña admin. Es insegura a propósito para la instalación
            # inicial: la aplicación obliga a cambiarla en el primer ingreso.
            full_name = "Administrador"
            username, password = DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD
        else:
            print("Creación del superadmin (administra los hogares)\n")
            full_name = _ask(input_fn, "Tu nombre")
            username = _ask_username(input_fn)
            password = _ask_password(getpass_fn)

        try:
            admin = create_superadmin(
                db,
                full_name=full_name,
                username=username,
                password=password,
                must_change_password=use_default,
            )
        except DomainError as error:
            print(error.message, file=sys.stderr)
            return 1

        print(f"\nListo. Se creó el superadmin «{admin.username}».")
        if use_default:
            print(
                f"Usuario: {DEFAULT_ADMIN_USERNAME} / Contraseña: {DEFAULT_ADMIN_PASSWORD}\n"
                "Al ingresar por primera vez, la aplicación te pedirá cambiar la contraseña."
            )
        print("Desde la sección Hogares podés crear cada hogar con su administrador.")
        return 0


# En un servidor público la contraseña inicial tiene que ser fuerte desde el primer momento.
SERVER_PASSWORD_MIN_LENGTH = 12


def create_admin_from_env(
    session_factory: Callable[[], AbstractContextManager[Session]],
    env: dict[str, str] | None = None,
) -> int:
    """Crea el superadmin con los datos de las variables de entorno (para Railway u otro
    servidor, donde no hay consola para escribirlos). Si ya existe, no hace nada: se puede
    ejecutar en cada despliegue."""
    env = dict(os.environ) if env is None else env
    with session_factory() as db:
        if superadmin_exists(db):
            print("Superadmin: ya existe, no se crea otro.")
            return 0
    password = env.get("SUPERADMIN_PASSWORD", "")
    if len(password) < SERVER_PASSWORD_MIN_LENGTH:
        print(
            "Falta el superadmin. Definí la variable SUPERADMIN_PASSWORD (mínimo "
            f"{SERVER_PASSWORD_MIN_LENGTH} caracteres) y, si querés, SUPERADMIN_USERNAME "
            "(por defecto «admin»).",
            file=sys.stderr,
        )
        return 1
    try:
        username = _username_adapter.validate_python(env.get("SUPERADMIN_USERNAME", "admin"))
    except ValidationError:
        print("SUPERADMIN_USERNAME no es un nombre de usuario válido.", file=sys.stderr)
        return 1
    with session_factory() as db:
        try:
            create_superadmin(
                db,
                full_name="Administrador",
                username=username,
                password=password,
                must_change_password=False,
            )
        except DomainError as error:
            print(error.message, file=sys.stderr)
            return 1
    print(f"Superadmin «{username}» creado. Ya podés borrar SUPERADMIN_PASSWORD de las variables.")
    return 0


def make_superadmin(
    session_factory: Callable[[], AbstractContextManager[Session]], username: str
) -> int:
    """Convierte un usuario existente en superadmin (deja de pertenecer a su hogar)."""
    with session_factory() as db:
        user = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
        if user is None:
            print(f"No existe el usuario «{username}».", file=sys.stderr)
            return 1
        if user.role == UserRole.SUPERADMIN:
            print(f"«{user.username}» ya es superadmin.")
            return 0
        if db.scalar(select(Transaction.id).where(Transaction.created_by_id == user.id)):
            print(
                f"«{user.username}» tiene pagos registrados en su hogar: no puede dejar el hogar. "
                "Creá un superadmin nuevo con create-admin.",
                file=sys.stderr,
            )
            return 1
        household = user.household_id
        user.role = UserRole.SUPERADMIN
        user.household_id = None
        audit.record(
            db,
            "superadmin.promoted",
            actor=user,
            household_id=household,
            entity_type="user",
            entity_id=user.id,
        )
        db.commit()
        print(f"Listo. «{user.username}» ahora es superadmin y ya no pertenece a ningún hogar.")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="Crear el superadmin (administra hogares)")
    create.add_argument(
        "--desde-entorno",
        action="store_true",
        help="Usar SUPERADMIN_USERNAME y SUPERADMIN_PASSWORD (servidor); no hace nada si ya existe",
    )
    create.add_argument(
        "--default",
        action="store_true",
        help="Crear el usuario admin / contraseña admin (se pide cambiarla al primer ingreso)",
    )
    promote = commands.add_parser(
        "make-superadmin", help="Convertir un usuario existente en superadmin"
    )
    promote.add_argument("username")
    args = parser.parse_args(argv)

    from app.core.database import SessionLocal

    if args.command == "create-admin" and args.desde_entorno:
        return create_admin_from_env(SessionLocal)
    if args.command == "create-admin":
        return create_admin(SessionLocal, use_default=args.default)
    if args.command == "make-superadmin":
        return make_superadmin(SessionLocal, args.username)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
