"""Panel de seguridad: solo el superadmin. Intentos de ingreso y bloqueos (nada financiero)."""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.api.deps import DbSession, SuperAuth, client_ip
from app.services import security as security_service

router = APIRouter(prefix="/security", tags=["security"])


class UnlockRequest(BaseModel):
    username: str | None = Field(default=None, max_length=254)
    ip_address: str | None = Field(default=None, max_length=45)


class UnlockResult(BaseModel):
    released: int


@router.get("")
def security_overview(
    auth: SuperAuth, request: Request, db: DbSession
) -> security_service.Overview:
    return security_service.overview(db, client_ip(request))


@router.post("/unlock")
def unlock(body: UnlockRequest, auth: SuperAuth, request: Request, db: DbSession) -> UnlockResult:
    released = security_service.unlock(
        db,
        auth.user,
        username=body.username,
        ip_address=body.ip_address,
        request_ip=client_ip(request),
    )
    return UnlockResult(released=released)
