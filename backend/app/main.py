"""Punto de entrada de la API.

Ejecutar en desarrollo (desde la carpeta backend):  uvicorn app.main:app --reload
"""

import base64
import hashlib
import logging
import re
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import DomainError, TooManyAttemptsError

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    # La documentación interactiva (/api/docs) solo se publica fuera de producción.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title="Casa en Orden API",
        version="0.1.0",
        docs_url="/api/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
    )

    # CORS restrictivo: solo el origen del frontend, con cookies, y solo los encabezados necesarios.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    # Comprime las respuestas grandes (listados JSON y archivos del frontend).
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # noqa: ANN001, ANN202
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith("/api/"):
            # Las respuestas de la API son datos, nunca una página: no pueden cargar ni ejecutar
            # nada (los comprobantes traen su propia política, que no se pisa).
            response.headers.setdefault("Content-Security-Policy", _API_CSP)
        if settings.is_production:
            # Solo por HTTPS de ahora en más (en desarrollo se usa http://localhost).
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        headers = {}
        if isinstance(exc, TooManyAttemptsError):
            headers["Retry-After"] = str(exc.retry_after_seconds)
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.message}, headers=headers
        )

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        # El detalle queda en el log del servidor; el cliente recibe un mensaje genérico.
        logger.exception("Error no controlado en %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Ocurrió un error interno. Intentá nuevamente más tarde."},
        )

    app.include_router(api_router)
    if (settings.frontend_dist / "index.html").is_file():
        _serve_frontend(app, settings.frontend_dist.resolve())
    return app


# Los archivos de /assets llevan un hash en el nombre: si cambian, cambia el nombre. Por eso el
# navegador puede guardarlos un año. index.html, en cambio, se revalida siempre.
_IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}
_REVALIDATE = {"Cache-Control": "no-cache"}

# En todas las respuestas: el navegador no "adivina" tipos de archivo, la app no se puede
# mostrar dentro de otro sitio (clickjacking), no se filtra la dirección a otros sitios y no
# se piden permisos que la app no usa.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}
_API_CSP = "default-src 'none'; frame-ancestors 'none'"


def _content_security_policy(index_html: str) -> str:
    """Política de contenido de la aplicación web: solo código propio. El único script en
    línea (el que aplica el tema antes de dibujar) se autoriza por su hash exacto."""
    hashes = [
        "'sha256-" + base64.b64encode(hashlib.sha256(script.encode()).digest()).decode() + "'"
        for script in re.findall(r"<script>(.*?)</script>", index_html, flags=re.S)
    ]
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' {' '.join(hashes)}".strip(),
            # Los componentes de la interfaz aplican estilos en línea (posiciones, anchos).
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


def _serve_frontend(app: FastAPI, dist: Path) -> None:
    """Sirve la aplicación web compilada. Las rutas desconocidas devuelven index.html para que
    el enrutador del frontend las resuelva (recargar /pagos funciona)."""
    index = dist / "index.html"
    page_headers = {
        **_REVALIDATE,
        "Content-Security-Policy": _content_security_policy(index.read_text(encoding="utf-8")),
    }

    @app.get("/{path:path}", include_in_schema=False, response_model=None)
    async def frontend(path: str) -> FileResponse | JSONResponse:
        if path == "api" or path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        file = (dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(dist):
            headers = _IMMUTABLE if path.startswith("assets/") else _REVALIDATE
            return FileResponse(file, headers=headers)
        return FileResponse(index, headers=page_headers)


app = create_app()
