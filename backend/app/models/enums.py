"""Valores permitidos para los campos de tipo enumerado.

Se guardan en PostgreSQL como texto con una restricción CHECK (no como ENUM nativo):
agregar un valor nuevo en el futuro es una migración simple y reversible.
"""

import enum

from sqlalchemy import Enum


class UserRole(enum.StrEnum):
    # Administra los hogares (crea hogares y sus administradores). No pertenece a ningún hogar.
    SUPERADMIN = "superadmin"
    # Administra SU hogar: usuarios, categorías y servicios.
    ADMIN = "admin"
    MEMBER = "member"


class CategoryStructure(enum.StrEnum):
    """Cómo se subdivide una categoría al registrar un pago."""

    # Solo la categoría (ej. Supermercado).
    SIMPLE = "simple"
    # Categoría → tipo (ej. Tarjeta de crédito → Visa).
    TYPES = "types"
    # Categoría → elemento → tipo (ej. Auto → Fiat Cronos → Seguro). Los tipos son comunes
    # a todos los elementos de la categoría.
    ITEMS_AND_TYPES = "items_and_types"


class TransactionStatus(enum.StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class ServiceFrequency(enum.StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    BIMONTHLY = "bimonthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"


class AmountType(enum.StrEnum):
    FIXED = "fixed"
    VARIABLE = "variable"


class ServicePaymentStatus(enum.StrEnum):
    # "Vencido" no se guarda: se calcula (pendiente + fecha de vencimiento pasada).
    PENDING = "pending"
    PAID = "paid"


def str_enum(enum_cls: type[enum.StrEnum], name: str) -> Enum:
    """Columna VARCHAR + CHECK que guarda el valor ("expense"), no el nombre ("EXPENSE")."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda cls: [member.value for member in cls],
        validate_strings=True,
    )
