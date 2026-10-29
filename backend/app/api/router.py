from fastapi import APIRouter

from app.api.routes import (
    attachments,
    audit,
    auth,
    catalog,
    health,
    households,
    reports,
    services,
    transactions,
    users,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(users.members_router)
api_router.include_router(audit.router)
api_router.include_router(catalog.router)
api_router.include_router(transactions.router)
api_router.include_router(attachments.router)
api_router.include_router(services.services_router)
api_router.include_router(services.periods_router)
api_router.include_router(households.router)
api_router.include_router(reports.reports_router)
api_router.include_router(reports.budgets_router)
