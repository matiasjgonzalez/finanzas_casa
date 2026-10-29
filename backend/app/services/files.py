"""Validación de comprobantes: tipo real del archivo (por su contenido) y nombre seguro."""

import re
import unicodedata

from app.core.errors import ValidationError

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp"}
EXTENSIONS_HINT = "PDF, JPG, PNG o WEBP"


def detect_file_type(data: bytes) -> tuple[str, str] | None:
    """Devuelve (content_type, extensión) según los primeros bytes ("firma") del archivo.

    No se confía en la extensión ni en el tipo que informa el navegador: ambos los controla
    quien sube el archivo. La firma del contenido es mucho más difícil de falsear por error.
    """
    if data.startswith(b"%PDF-"):
        return "application/pdf", "pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


def safe_display_name(filename: str | None) -> str:
    """Nombre original solo para MOSTRAR: sin carpetas ni caracteres de control. Nunca se usa
    como nombre físico del archivo."""
    name = re.split(r"[\\/]", filename or "")[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C").strip()
    return name[:255] or "comprobante"


def validate_upload(filename: str | None, data: bytes, max_bytes: int) -> tuple[str, str]:
    """Valida el archivo y devuelve (content_type, extensión). Lanza ValidationError si no sirve."""
    if not data:
        raise ValidationError("El archivo está vacío.")
    if len(data) > max_bytes:
        raise ValidationError(f"El archivo supera el máximo de {max_bytes // (1024 * 1024)} MB.")

    extension = safe_display_name(filename).rsplit(".", 1)[-1].lower() if filename else ""
    detected = detect_file_type(data)
    if extension not in ALLOWED_EXTENSIONS or detected is None:
        raise ValidationError(f"Formato no admitido. Subí un archivo {EXTENSIONS_HINT}.")
    # La extensión tiene que corresponder al contenido (jpeg y jpg son lo mismo).
    if detected[1] != ("jpg" if extension == "jpeg" else extension):
        raise ValidationError(
            "El contenido del archivo no coincide con su extensión. "
            f"Subí un archivo {EXTENSIONS_HINT} válido."
        )
    return detected
