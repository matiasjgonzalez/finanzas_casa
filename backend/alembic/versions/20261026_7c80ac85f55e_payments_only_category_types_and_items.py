"""payments only, category types and items

La aplicación pasa a registrar solo pagos (gastos):
- Se eliminan el tipo de movimiento (gasto/ingreso/transferencia/pago de tarjeta) y el medio de pago.
- Las categorías ganan una estructura: simple, con tipos, o con elementos y tipos (ej. Auto).
- Se crean las tablas category_types y category_items.
- Datos: se borran las categorías iniciales que nunca se usaron y se crean
  "Tarjeta de crédito", "Servicio" y "Auto" en cada hogar.

Revision ID: 7c80ac85f55e
Revises: 6de8e16c1461
Create Date: 2026-10-26 18:18:31.111926

"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c80ac85f55e"
down_revision: Union[str, Sequence[str], None] = "6de8e16c1461"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Categorías que se creaban automáticamente antes de este cambio.
OLD_DEFAULT_CATEGORIES = [
    "Vivienda", "Servicios", "Supermercado", "Transporte", "Salud", "Educación", "Ocio",
    "Restaurantes", "Ropa", "Suscripciones", "Otros", "Ingresos laborales", "Otros ingresos",
]
# (nombre, estructura, nombre de cada elemento)
NEW_DEFAULT_CATEGORIES = [
    ("Tarjeta de crédito", "types", None),
    ("Servicio", "types", None),
    ("Auto", "items_and_types", "Auto"),
]

UNUSED = """
    NOT EXISTS (SELECT 1 FROM transactions t WHERE t.category_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM budgets b WHERE b.category_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM services s WHERE s.category_id = c.id)
"""


def _child_table(name: str) -> None:
    op.create_table(
        name,
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["household_id", "category_id"],
            ["categories.household_id", "categories.id"],
            name=op.f(f"fk_{name}_household_id_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}")),
        sa.UniqueConstraint("category_id", "id", name=op.f(f"uq_{name}_category_id_id")),
    )
    op.create_index(
        f"uq_{name}_category_name",
        name,
        ["category_id", sa.literal_column("lower(name)")],
        unique=True,
    )


def upgrade() -> None:
    conn = op.get_bind()

    # 0. Protección: este cambio solo admite pagos. Si hubiera otros movimientos, no se toca nada.
    others = conn.execute(sa.text("SELECT count(*) FROM transactions WHERE type <> 'expense'")).scalar()
    if others:
        raise RuntimeError(
            f"Hay {others} movimientos que no son gastos (ingresos, transferencias o pagos de "
            "tarjeta). Revisalos antes de aplicar esta migración."
        )
    used_income = conn.execute(
        sa.text(f"SELECT count(*) FROM categories c WHERE kind = 'income' AND NOT ({UNUSED})")
    ).scalar()
    if used_income:
        raise RuntimeError("Hay categorías de ingreso en uso (presupuestos o servicios).")

    # 1. Tipos y elementos de categoría.
    _child_table("category_items")
    _child_table("category_types")

    # 2. Categorías: estructura y nombre de elemento; ya no hay "gasto/ingreso".
    op.add_column(
        "categories",
        sa.Column(
            "structure",
            sa.Enum(
                "simple", "types", "items_and_types",
                name="category_structure", native_enum=False, create_constraint=True, length=32,
            ),
            server_default="simple",
            nullable=False,
        ),
    )
    op.add_column("categories", sa.Column("item_label", sa.String(length=40), nullable=True))
    # Datos: se borran las categorías iniciales viejas que nunca se usaron.
    conn.execute(
        sa.text(f"DELETE FROM categories c WHERE (kind = 'income' OR name = ANY(:names)) AND {UNUSED}"),
        {"names": OLD_DEFAULT_CATEGORIES},
    )
    op.drop_index(op.f("uq_categories_household_kind_name"), table_name="categories")
    op.drop_column("categories", "kind")  # también elimina su restricción CHECK
    op.create_index(
        "uq_categories_household_name",
        "categories",
        ["household_id", sa.literal_column("lower(name)")],
        unique=True,
    )
    # Datos: nuevas categorías iniciales en cada hogar (si no existe una con ese nombre).
    for household_id in conn.execute(sa.text("SELECT id FROM households")).scalars():
        for name, structure, item_label in NEW_DEFAULT_CATEGORIES:
            conn.execute(
                # CAST explícitos: el mismo parámetro se usa en dos lugares y PostgreSQL
                # necesita saber su tipo.
                sa.text(
                    "INSERT INTO categories (id, household_id, name, structure, item_label) "
                    "SELECT CAST(:id AS uuid), CAST(:h AS uuid), CAST(:name AS varchar), "
                    "CAST(:structure AS varchar), CAST(:item_label AS varchar) WHERE NOT EXISTS "
                    "(SELECT 1 FROM categories WHERE household_id = CAST(:h AS uuid) "
                    "AND lower(name) = lower(CAST(:name AS varchar)))"
                ),
                {"id": uuid.uuid4(), "h": household_id, "name": name, "structure": structure,
                 "item_label": item_label},
            )

    # 3. Pagos: sin tipo ni medio de pago; con tipo y elemento de la categoría.
    op.drop_constraint(
        op.f("ck_transactions_category_matches_type"), "transactions", type_="check"
    )
    op.drop_constraint(
        op.f("fk_transactions_household_id_payment_method_id_payment_methods"),
        "transactions",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_transactions_household_type_date"), table_name="transactions")
    op.drop_column("transactions", "payment_method_id")
    op.drop_column("transactions", "type")  # también elimina su restricción CHECK
    op.alter_column("transactions", "description", existing_type=sa.String(200), nullable=True)
    op.alter_column("transactions", "category_id", existing_type=sa.Uuid(), nullable=False)
    op.add_column("transactions", sa.Column("category_type_id", sa.Uuid(), nullable=True))
    op.add_column("transactions", sa.Column("item_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_transactions_category_type_id"), "transactions", ["category_type_id"])
    op.create_index(op.f("ix_transactions_item_id"), "transactions", ["item_id"])
    op.create_foreign_key(
        op.f("fk_transactions_category_id_item_id_category_items"),
        "transactions",
        "category_items",
        ["category_id", "item_id"],
        ["category_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_transactions_category_id_category_type_id_category_types"),
        "transactions",
        "category_types",
        ["category_id", "category_type_id"],
        ["category_id", "id"],
        ondelete="RESTRICT",
    )

    # 4. Medios de pago: ya no se usan.
    op.drop_index(op.f("uq_payment_methods_household_name"), table_name="payment_methods")
    op.drop_table("payment_methods")


def downgrade() -> None:
    # Volver atrás solo es posible sin pagos cargados: el esquema anterior exigía medio de pago.
    if op.get_bind().execute(sa.text("SELECT count(*) FROM transactions")).scalar():
        raise RuntimeError("No se puede revertir: hay pagos registrados.")

    op.create_table(
        "payment_methods",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "cash", "debit_card", "credit_card", "bank_transfer", "digital_wallet", "other",
                name="payment_method_kind", native_enum=False, create_constraint=True, length=32,
            ),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"],
            name=op.f("fk_payment_methods_household_id_households"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_methods")),
        sa.UniqueConstraint("household_id", "id", name=op.f("uq_payment_methods_household_id_id")),
    )
    op.create_index(
        op.f("uq_payment_methods_household_name"),
        "payment_methods",
        ["household_id", sa.literal_column("lower(name)")],
        unique=True,
    )

    op.drop_constraint(
        op.f("fk_transactions_category_id_category_type_id_category_types"),
        "transactions", type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_transactions_category_id_item_id_category_items"),
        "transactions", type_="foreignkey",
    )
    op.drop_index(op.f("ix_transactions_item_id"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_category_type_id"), table_name="transactions")
    op.drop_column("transactions", "item_id")
    op.drop_column("transactions", "category_type_id")
    op.alter_column("transactions", "category_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column("transactions", "description", existing_type=sa.String(200), nullable=False)
    op.add_column(
        "transactions",
        sa.Column(
            "type",
            sa.Enum(
                "expense", "income", "transfer", "card_payment",
                name="transaction_type", native_enum=False, create_constraint=True, length=32,
            ),
            nullable=False,
        ),
    )
    op.add_column("transactions", sa.Column("payment_method_id", sa.Uuid(), nullable=False))
    op.create_index(
        op.f("ix_transactions_household_type_date"),
        "transactions",
        ["household_id", "type", "occurred_on"],
    )
    op.create_foreign_key(
        op.f("fk_transactions_household_id_payment_method_id_payment_methods"),
        "transactions",
        "payment_methods",
        ["household_id", "payment_method_id"],
        ["household_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_transactions_category_matches_type"),
        "transactions",
        "(type IN ('expense', 'income')) = (category_id IS NOT NULL)",
    )

    op.drop_index("uq_categories_household_name", table_name="categories")
    op.add_column(
        "categories",
        sa.Column(
            "kind",
            sa.Enum(
                "expense", "income",
                name="category_kind", native_enum=False, create_constraint=True, length=32,
            ),
            server_default="expense",
            nullable=False,
        ),
    )
    op.alter_column("categories", "kind", server_default=None)
    op.create_index(
        op.f("uq_categories_household_kind_name"),
        "categories",
        ["household_id", "kind", sa.literal_column("lower(name)")],
        unique=True,
    )
    op.drop_column("categories", "item_label")
    op.drop_column("categories", "structure")

    op.drop_index("uq_category_types_category_name", table_name="category_types")
    op.drop_table("category_types")
    op.drop_index("uq_category_items_category_name", table_name="category_items")
    op.drop_table("category_items")
