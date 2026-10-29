"""Cálculo de fechas de vencimiento según la frecuencia de un servicio.

Cada vencimiento se calcula desde la fecha ANCLA (el primer vencimiento), no desde el anterior.
Así, un servicio que vence el 31 cae el 28/29 de febrero y vuelve al 31 en marzo, en lugar de
quedar corrido al 28 para siempre.
"""

import calendar
from datetime import date, timedelta

from app.models.enums import ServiceFrequency

MONTHS_PER_STEP = {
    ServiceFrequency.MONTHLY: 1,
    ServiceFrequency.BIMONTHLY: 2,
    ServiceFrequency.QUARTERLY: 3,
    ServiceFrequency.SEMIANNUAL: 6,
    ServiceFrequency.ANNUAL: 12,
}

# Tope de seguridad: ningún pedido genera más de esta cantidad de vencimientos por servicio.
MAX_OCCURRENCES = 600


def add_months(anchor: date, months: int) -> date:
    """Suma meses conservando el día del ancla; si el mes es más corto, usa su último día."""
    year, month_index = divmod(anchor.month - 1 + months, 12)
    year += anchor.year
    month = month_index + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor.day, last_day))


def nth_due_date(anchor: date, frequency: ServiceFrequency, n: int) -> date:
    """Vencimiento número n (0 = el ancla)."""
    if frequency == ServiceFrequency.WEEKLY:
        return anchor + timedelta(weeks=n)
    return add_months(anchor, n * MONTHS_PER_STEP[frequency])


def due_dates_until(anchor: date, frequency: ServiceFrequency, until: date) -> list[date]:
    """Todos los vencimientos desde el ancla hasta `until` (inclusive)."""
    dates: list[date] = []
    for n in range(MAX_OCCURRENCES):
        due = nth_due_date(anchor, frequency, n)
        if due > until:
            break
        dates.append(due)
    return dates
