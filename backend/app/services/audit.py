import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def record(
    db: Session,
    action: str,
    *,
    actor: User | None,
    household_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Agrega una entrada al historial. Se guarda junto con la operación (mismo commit).

    Nunca incluir contraseñas, tokens ni otros secretos en details.
    """
    db.add(
        AuditLog(
            household_id=household_id or (actor.household_id if actor else None),
            actor_user_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            details=details,
            ip_address=ip_address,
        )
    )
