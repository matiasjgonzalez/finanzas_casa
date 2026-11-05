from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from app.core import clock
from app.core.config import Settings, get_settings
from app.services import recurring


def test_today_is_the_households_day_not_the_servers() -> None:
    """A las 22 h de Argentina el servidor (en UTC) ya está en el día siguiente."""
    late_night = datetime(2026, 11, 6, 1, 0, tzinfo=UTC)  # 5/11 a las 22:00 en Buenos Aires

    assert get_settings().timezone == "America/Argentina/Buenos_Aires"
    assert clock.today(late_night) == date(2026, 11, 5)
    assert clock.today(datetime(2026, 11, 6, 3, 0, tzinfo=UTC)) == date(2026, 11, 6)  # medianoche


def test_the_timezone_can_be_changed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "timezone", "Europe/Madrid")

    assert clock.today(datetime(2026, 11, 5, 23, 30, tzinfo=UTC)) == date(2026, 11, 6)


def test_an_unknown_timezone_stops_the_app() -> None:
    with pytest.raises(ValidationError, match="Zona horaria desconocida"):
        Settings(database_url="postgresql+psycopg://x@localhost/x", timezone="Marte/Olympus")


def test_due_dates_use_the_households_day(monkeypatch: pytest.MonkeyPatch) -> None:
    """Una cuenta que vence hoy no aparece vencida a la noche (el servidor ya es "mañana")."""
    monkeypatch.setattr(clock, "today", lambda: date(2026, 11, 5))

    assert recurring._today() == date(2026, 11, 5)
