"""login with username instead of email

Revision ID: 2cda34dac140
Revises: 72c91bbf1f37
Create Date: 2026-10-26 16:00:00.988495

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2cda34dac140"
down_revision: Union[str, Sequence[str], None] = "72c91bbf1f37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Escrita a mano: es un RENOMBRADO. Autogenerate lo vería como "borrar email + crear
    # username", lo que perdería los datos existentes.
    op.drop_index("uq_users_email_lower", table_name="users")
    # Si ya hubiera usuarios, su nombre de usuario pasa a ser lo que estaba antes de la "@".
    op.execute("UPDATE users SET email = left(lower(split_part(email, '@', 1)), 40)")
    op.alter_column(
        "users",
        "email",
        new_column_name="username",
        type_=sa.String(length=40),
        existing_type=sa.String(length=254),
        existing_nullable=False,
    )
    op.create_index(
        "uq_users_username_lower", "users", [sa.literal_column("lower(username)")], unique=True
    )

    op.drop_index("ix_login_attempts_email_created", table_name="login_attempts")
    op.alter_column("login_attempts", "email", new_column_name="username")
    op.create_index(
        "ix_login_attempts_username_created", "login_attempts", ["username", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_login_attempts_username_created", table_name="login_attempts")
    op.alter_column("login_attempts", "username", new_column_name="email")
    op.create_index("ix_login_attempts_email_created", "login_attempts", ["email", "created_at"])

    op.drop_index("uq_users_username_lower", table_name="users")
    op.alter_column(
        "users",
        "username",
        new_column_name="email",
        type_=sa.String(length=254),
        existing_type=sa.String(length=40),
        existing_nullable=False,
    )
    op.create_index("uq_users_email_lower", "users", [sa.literal_column("lower(email)")], unique=True)
