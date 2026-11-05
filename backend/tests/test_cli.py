from collections.abc import Callable, Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cli import create_admin, make_superadmin, reset_superadmin_password
from app.core.security import verify_password
from app.models import AuditLog, Household, User
from app.models.enums import UserRole
from tests.factories import build_payment, create_household, create_user


def answers(*values: str) -> Callable[[str], str]:
    queue = list(values)
    return lambda _prompt: queue.pop(0)


@pytest.fixture
def session_factory(db: Session) -> Callable[[], object]:
    @contextmanager
    def factory() -> Iterator[Session]:
        yield db

    return factory


def test_create_admin_creates_the_superadmin_without_household(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = create_admin(
        session_factory,
        input_fn=answers("Ana Pérez", " Ana "),
        getpass_fn=answers("una-contraseña-segura", "una-contraseña-segura"),
    )

    assert exit_code == 0
    admin = db.scalars(select(User)).one()
    assert admin.username == "ana"
    assert admin.role == UserRole.SUPERADMIN
    assert admin.household_id is None
    assert admin.must_change_password is False
    assert verify_password("una-contraseña-segura", admin.password_hash)
    assert db.scalars(select(Household)).all() == []  # los hogares se crean desde la app
    assert db.scalars(select(AuditLog.action)).one() == "superadmin.created"
    assert "una-contraseña-segura" not in capsys.readouterr().out


def test_create_admin_default_is_admin_admin_with_forced_change(
    db: Session, session_factory: Callable[[], object]
) -> None:
    assert create_admin(session_factory, use_default=True) == 0

    admin = db.scalars(select(User)).one()
    assert admin.username == "admin"
    assert admin.role == UserRole.SUPERADMIN
    assert admin.must_change_password is True
    assert verify_password("admin", admin.password_hash)


def test_create_admin_asks_again_for_invalid_username_or_passwords(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = create_admin(
        session_factory,
        input_fn=answers("", "Ana", "Ana María", "ana"),
        getpass_fn=answers(
            "corta",
            "una-contraseña-segura",
            "otra-distinta-xx",
            "una-contraseña-segura",
            "una-contraseña-segura",
        ),
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "obligatorio" in output
    assert "sin espacios" in output
    assert "debe tener entre" in output
    assert "no coinciden" in output


def test_create_admin_refuses_when_a_superadmin_exists(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    assert create_admin(session_factory, use_default=True) == 0

    exit_code = create_admin(session_factory, use_default=True)

    assert exit_code == 1
    assert "Ya existe un superadmin" in capsys.readouterr().err
    assert len(db.scalars(select(User)).all()) == 1


def test_make_superadmin_takes_the_user_out_of_its_household(
    db: Session, session_factory: Callable[[], object]
) -> None:
    home = create_household(db)
    member = create_user(db, home.household, username="jose")

    assert make_superadmin(session_factory, "admin") == 1  # no existe
    assert make_superadmin(session_factory, "JOSE") == 0

    db.refresh(member)
    assert member.role == UserRole.SUPERADMIN
    assert member.household_id is None


def test_make_superadmin_refuses_users_with_payments(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    home = create_household(db)
    db.add(build_payment(home))
    db.flush()

    exit_code = make_superadmin(session_factory, home.admin.username)

    assert exit_code == 1
    assert "tiene pagos registrados" in capsys.readouterr().err
    db.refresh(home.admin)
    assert home.admin.role == UserRole.ADMIN


def test_create_admin_from_env_for_the_server(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    from app.cli import create_admin_from_env

    # Sin contraseña (o con una débil) no crea nada y avisa qué falta.
    assert create_admin_from_env(session_factory, env={}) == 1
    assert "SUPERADMIN_PASSWORD no está definida" in capsys.readouterr().err
    assert create_admin_from_env(session_factory, env={"SUPERADMIN_PASSWORD": "corta"}) == 1
    error = capsys.readouterr().err
    assert "tiene 5 caracteres y se necesitan al menos 12" in error
    assert "corta" not in error  # nunca muestra la contraseña
    assert db.scalars(select(User)).all() == []

    env = {"SUPERADMIN_USERNAME": "dueno", "SUPERADMIN_PASSWORD": "una-clave-bien-larga"}
    assert create_admin_from_env(session_factory, env=env) == 0
    admin = db.scalars(select(User)).one()
    assert admin.username == "dueno" and admin.role == UserRole.SUPERADMIN
    assert verify_password("una-clave-bien-larga", admin.password_hash)
    assert admin.must_change_password is False

    # En cada despliegue se vuelve a ejecutar: si ya existe, no hace nada (ni falla).
    assert create_admin_from_env(session_factory, env={}) == 0
    assert len(db.scalars(select(User)).all()) == 1


def test_reset_superadmin_password_gives_a_temporary_one(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    from app.services.households import create_superadmin

    admin = create_superadmin(
        db,
        full_name="Admin",
        username="admin",
        password="olvidada-1234",
        must_change_password=False,
    )
    db.commit()

    assert reset_superadmin_password(session_factory) == 0

    output = capsys.readouterr().out
    password = output.split("Contraseña provisoria: ")[1].split()[0]
    db.refresh(admin)
    assert len(password) == 14
    assert verify_password(password, admin.password_hash)
    assert not verify_password("olvidada-1234", admin.password_hash)
    assert admin.must_change_password is True  # elige la definitiva al ingresar
    actions = db.scalars(select(AuditLog.action).where(AuditLog.entity_id == str(admin.id)))
    assert "user.password_reset" in set(actions)


def test_reset_superadmin_password_only_touches_superadmins(
    db: Session, session_factory: Callable[[], object], capsys: pytest.CaptureFixture[str]
) -> None:
    home = create_household(db)

    assert reset_superadmin_password(session_factory, home.admin.username) == 1
    assert "No hay ningún superadmin" in capsys.readouterr().err
