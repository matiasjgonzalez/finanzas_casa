from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import AdminAuth, DbSession
from app.models import AuditLog, User
from app.schemas.audit import AuditLogOut
from app.schemas.common import Page

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    auth: AdminAuth,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> Page[AuditLogOut]:
    """Historial de acciones del hogar, de la más reciente a la más antigua."""
    household_filter = AuditLog.household_id == auth.user.household_id
    total = db.scalar(select(func.count()).select_from(AuditLog).where(household_filter))
    rows = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(household_filter)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        AuditLogOut(
            id=log.id,
            action=log.action,
            actor_name=actor_name,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
        for log, actor_name in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)
