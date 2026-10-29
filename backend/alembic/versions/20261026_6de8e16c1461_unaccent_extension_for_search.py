"""unaccent extension for search

Revision ID: 6de8e16c1461
Revises: 215456dabeab
Create Date: 2026-10-26 17:53:41.829935

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6de8e16c1461"
down_revision: Union[str, Sequence[str], None] = "215456dabeab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Permite buscar sin distinguir tildes ("super" encuentra "Súper"). Es una extensión
    # incluida en PostgreSQL y marcada como "trusted": el dueño de la base puede instalarla.
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
