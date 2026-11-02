"""Importa todos los modelos para que queden registrados en Base.metadata (lo usa Alembic)."""

from app.models.audit import AuditLog
from app.models.base import Base
from app.models.budget import Budget
from app.models.catalog import Category, CategoryItem, CategoryType
from app.models.household import Household
from app.models.service import Service, ServicePayment
from app.models.stored_file import StoredFile
from app.models.transaction import Attachment, Transaction
from app.models.user import LoginAttempt, User, UserSession

__all__ = [
    "Attachment",
    "AuditLog",
    "Base",
    "Budget",
    "Category",
    "CategoryItem",
    "CategoryType",
    "Household",
    "LoginAttempt",
    "Service",
    "ServicePayment",
    "StoredFile",
    "Transaction",
    "User",
    "UserSession",
]
