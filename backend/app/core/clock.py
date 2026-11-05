"""La fecha de hoy en la zona horaria del hogar (TIMEZONE), no en la del servidor.

Los servidores en internet (Railway, Render) corren en UTC: con date.today(), en Argentina a
partir de las 21 h ya sería "mañana" y una cuenta que vence hoy aparecería vencida.
"""

from datetime import UTC, date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


@lru_cache
def _zone(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def today(now: datetime | None = None) -> date:
    """Hoy en TIMEZONE. `now` (con zona horaria) es para las pruebas."""
    return (now or datetime.now(UTC)).astimezone(_zone(get_settings().timezone)).date()
