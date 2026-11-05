"""Panel de seguridad: motivo y dispositivo de cada intento de ingreso, y desbloqueo.

Revision ID: 3f9a1c2d7e4b
Revises: ea2b6fcf1dff
Create Date: 2026-11-05 20:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3f9a1c2d7e4b"
down_revision: Union[str, Sequence[str], None] = "ea2b6fcf1dff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "login_attempts",
        sa.Column("result", sa.String(length=20), server_default="failed", nullable=False),
    )
    op.add_column("login_attempts", sa.Column("user_agent", sa.String(length=255), nullable=True))
    op.add_column(
        "login_attempts", sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True)
    )
    # Los intentos anteriores: los que salieron bien son "ok"; de los otros no se sabe el motivo.
    op.execute("UPDATE login_attempts SET result = 'ok' WHERE succeeded")
    # Para el panel (los últimos días, del más nuevo al más viejo) y para borrar los viejos.
    op.create_index("ix_login_attempts_created", "login_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_login_attempts_created", table_name="login_attempts")
    op.drop_column("login_attempts", "cleared_at")
    op.drop_column("login_attempts", "user_agent")
    op.drop_column("login_attempts", "result")
