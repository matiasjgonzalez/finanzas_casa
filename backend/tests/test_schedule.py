from datetime import date

import pytest

from app.models.enums import ServiceFrequency as F
from app.services.schedule import add_months, due_dates_until, nth_due_date


@pytest.mark.parametrize(
    "frequency, expected",
    [
        (F.WEEKLY, [date(2026, 1, 5), date(2026, 1, 12), date(2026, 1, 19), date(2026, 1, 26)]),
        (F.MONTHLY, [date(2026, 1, 5), date(2026, 2, 5), date(2026, 3, 5), date(2026, 4, 5)]),
        (F.BIMONTHLY, [date(2026, 1, 5), date(2026, 3, 5), date(2026, 5, 5), date(2026, 7, 5)]),
        (F.QUARTERLY, [date(2026, 1, 5), date(2026, 4, 5), date(2026, 7, 5), date(2026, 10, 5)]),
        (F.SEMIANNUAL, [date(2026, 1, 5), date(2026, 7, 5), date(2027, 1, 5), date(2027, 7, 5)]),
        (F.ANNUAL, [date(2026, 1, 5), date(2027, 1, 5), date(2028, 1, 5), date(2029, 1, 5)]),
    ],
)
def test_each_frequency(frequency: F, expected: list[date]) -> None:
    assert [nth_due_date(date(2026, 1, 5), frequency, n) for n in range(4)] == expected


def test_end_of_month_does_not_drift() -> None:
    """Vence el 31: febrero usa su último día y marzo vuelve al 31."""
    assert [nth_due_date(date(2026, 1, 31), F.MONTHLY, n) for n in range(4)] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]


def test_leap_year() -> None:
    assert add_months(date(2027, 2, 28), 12) == date(2028, 2, 28)
    assert add_months(date(2028, 2, 29), 12) == date(2029, 2, 28)


def test_due_dates_until_is_inclusive() -> None:
    dates = due_dates_until(date(2026, 1, 10), F.MONTHLY, until=date(2026, 3, 10))

    assert dates == [date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10)]


def test_due_dates_until_before_anchor_is_empty() -> None:
    assert due_dates_until(date(2026, 5, 1), F.MONTHLY, until=date(2026, 4, 30)) == []


def test_crossing_the_year() -> None:
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)
