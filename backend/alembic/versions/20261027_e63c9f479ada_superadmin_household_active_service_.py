"""superadmin, household active, service category

- Rol "superadmin": administra hogares y no pertenece a ninguno (household_id NULL).
- Hogares activables/desactivables.
- Marca de "categoría de servicios" (como máximo una por hogar). Datos: se marca la
  categoría llamada "Servicio" de cada hogar, si existe.

Revision ID: e63c9f479ada
Revises: 63abf144be22
Create Date: 2026-10-27 20:03:59.537510

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e63c9f479ada"
down_revision: Union[str, Sequence[str], None] = "63abf144be22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hogares activables.
    op.add_column(
        "households",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )

    # Rol superadmin: nuevo valor permitido y usuario sin hogar.
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_user_role"), "users", "role IN ('superadmin', 'admin', 'member')"
    )
    op.alter_column("users", "household_id", existing_type=sa.Uuid(), nullable=True)
    op.create_check_constraint(
        op.f("ck_users_superadmin_has_no_household"),
        "users",
        "(role = 'superadmin') = (household_id IS NULL)",
    )

    # Categoría de servicios: como máximo una por hogar (índice único parcial).
    op.add_column(
        "categories",
        sa.Column(
            "is_service_category", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.create_index(
        "uq_categories_household_service",
        "categories",
        ["household_id"],
        unique=True,
        postgresql_where=sa.text("is_service_category"),
    )
    # Datos: la categoría "Servicio" (con tipos) de cada hogar pasa a ser la de servicios.
    op.execute(
        "UPDATE categories SET is_service_category = true "
        "WHERE lower(name) = 'servicio' AND structure = 'types'"
    )


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM users WHERE role = 'superadmin'"))
        .scalar()
    ):
        raise RuntimeError("No se puede revertir: existen usuarios superadmin.")
    op.drop_index("uq_categories_household_service", table_name="categories")
    op.drop_column("categories", "is_service_category")
    op.drop_constraint(op.f("ck_users_superadmin_has_no_household"), "users", type_="check")
    op.alter_column("users", "household_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(op.f("ck_users_user_role"), "users", "role IN ('admin', 'member')")
    op.drop_column("households", "is_active")
