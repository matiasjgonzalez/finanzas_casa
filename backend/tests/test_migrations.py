from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, text

from alembic import command
from app.models import Base
from tests.conftest import alembic_config


def test_migrations_match_models(engine: Engine) -> None:
    """Si alguien cambia un modelo y olvida crear la migración, esta prueba falla."""
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)

    assert differences == []


def test_migrations_can_be_reverted_and_reapplied(engine: Engine, database_url: str) -> None:
    config = alembic_config(database_url)

    command.downgrade(config, "base")
    command.upgrade(config, "head")


def test_username_migration_converts_existing_emails(engine: Engine, database_url: str) -> None:
    """Usuarios creados cuando se iniciaba sesión con email conservan su cuenta."""
    config = alembic_config(database_url)
    command.downgrade(config, "72c91bbf1f37")
    try:
        with engine.begin() as conn:
            household_id = conn.execute(
                text(
                    "INSERT INTO households (id, name) VALUES (gen_random_uuid(), 'H') RETURNING id"
                )
            ).scalar_one()
            conn.execute(
                text(
                    "INSERT INTO users (id, household_id, email, full_name, password_hash, role) "
                    "VALUES (gen_random_uuid(), :h, 'Ana.Perez@Example.com', 'Ana', 'x', 'admin')"
                ),
                {"h": household_id},
            )

        command.upgrade(config, "head")

        with engine.connect() as conn:
            assert conn.execute(text("SELECT username FROM users")).scalar_one() == "ana.perez"
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM users"))
            # Las migraciones posteriores crean categorías iniciales para el hogar.
            conn.execute(text("DELETE FROM categories"))
            conn.execute(text("DELETE FROM households"))
        command.upgrade(config, "head")
