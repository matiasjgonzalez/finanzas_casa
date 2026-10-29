"""Presupuestos vigentes desde un mes: el importe puede quedar vacío ("sin presupuesto
desde este mes").

Revision ID: b7af87447ceb
Revises: a7d8f2968fa6
Create Date: 2026-10-28 14:21:53.708759

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7af87447ceb"
down_revision: Union[str, Sequence[str], None] = "a7d8f2968fa6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "budgets", "amount", existing_type=sa.NUMERIC(precision=14, scale=2), nullable=True
    )
    op.drop_constraint(op.f("ck_budgets_amount_positive"), "budgets", type_="check")
    op.create_check_constraint(
        op.f("ck_budgets_amount_positive"), "budgets", "amount IS NULL OR amount > 0"
    )


def downgrade() -> None:
    # Las filas "sin presupuesto" no existen en el esquema anterior.
    op.execute("DELETE FROM budgets WHERE amount IS NULL")
    op.drop_constraint(op.f("ck_budgets_amount_positive"), "budgets", type_="check")
    op.create_check_constraint(op.f("ck_budgets_amount_positive"), "budgets", "amount > 0")
    op.alter_column(
        "budgets", "amount", existing_type=sa.NUMERIC(precision=14, scale=2), nullable=False
    )
