import uuid
from urllib.parse import quote

from fastapi import APIRouter, Request, Response, status

from app.api.deps import CurrentAuth, DbSession, StorageDep, client_ip
from app.core.errors import NotFoundError
from app.services import attachments as attachments_service
from app.storage import StorageError

router = APIRouter(prefix="/attachments", tags=["attachments"])

# Un comprobante abierto en el navegador es "solo para mirar": no puede ejecutar código ni
# cargar nada, y queda aislado de la aplicación (sandbox: como si viniera de otro sitio, sin
# acceso a la sesión). Probado en Edge/Chrome: los PDF y las fotos se siguen viendo igual.
ATTACHMENT_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"


@router.get("/{attachment_id}/content")
def get_content(
    attachment_id: uuid.UUID,
    auth: CurrentAuth,
    db: DbSession,
    storage: StorageDep,
    download: bool = False,
) -> Response:
    """Entrega el archivo solo a integrantes del hogar (nunca desde una carpeta pública)."""
    attachment = attachments_service.get_attachment(db, auth.user, attachment_id)
    try:
        data = storage.read(attachment.storage_key)
    except StorageError as error:
        raise NotFoundError("El archivo del comprobante no está disponible.") from error

    disposition = "attachment" if download else "inline"
    filename = quote(attachment.original_filename)
    return Response(
        content=data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{filename}",
            # El navegador no debe "adivinar" otro tipo de contenido.
            "X-Content-Type-Options": "nosniff",
            # Datos privados: no guardarlos en cachés compartidas.
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": ATTACHMENT_CSP,
        },
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: uuid.UUID,
    auth: CurrentAuth,
    request: Request,
    db: DbSession,
    storage: StorageDep,
) -> None:
    attachments_service.delete_attachment(db, auth.user, storage, attachment_id, client_ip(request))
