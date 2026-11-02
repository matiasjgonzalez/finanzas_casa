"""Comprobantes guardados en la propia base (tabla stored_files), para servidores sin disco
permanente como el plan gratis de Render.

Revision ID: ea2b6fcf1dff
Revises: b7af87447ceb
Create Date: 2026-11-02 15:46:39.878149

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ea2b6fcf1dff"
down_revision: Union[str, Sequence[str], None] = "b7af87447ceb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stored_files",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_stored_files")),
    )


def downgrade() -> None:
    op.drop_table("stored_files")
