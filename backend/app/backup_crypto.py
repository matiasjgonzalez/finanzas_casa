"""Cifrado de las copias de seguridad con un par de claves.

- La clave PÚBLICA solo sirve para cifrar: va en GitHub (y en el .env) sin riesgo.
- La clave PRIVADA es la única que abre las copias: queda en tu PC (y en un pendrive).

Aunque alguien entrara a la cuenta de GitHub, las copias que encontraría no se pueden abrir.
Método: X25519 (acuerdo de claves) + HKDF-SHA256 + AES-256-GCM, lo mismo que usan herramientas
conocidas como age. Si el archivo se modifica, no se descifra (GCM lo detecta).

Formato del archivo .cifrado:
    MAGIC | clave pública efímera (32 bytes) | nonce (12 bytes) | datos cifrados + etiqueta
"""

import base64
import os
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MAGIC = b"CASA-EN-ORDEN-RESPALDO-CIFRADO-1\n"
PUBLIC_PREFIX = "casaenorden-publica-"
PRIVATE_PREFIX = "casaenorden-privada-"
_INFO = b"casa-en-orden respaldo v1"


class CryptoError(ValueError):
    """Clave o archivo inválido, con un mensaje para mostrar tal cual."""


def _raw(key: X25519PublicKey | X25519PrivateKey) -> bytes:
    if isinstance(key, X25519PrivateKey):
        return key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
    return key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def _decode(text: str, prefix: str, what: str) -> bytes:
    text = text.strip()
    if not text.startswith(prefix):
        raise CryptoError(f"Eso no es una clave {what} de Casa en Orden.")
    try:
        raw = base64.urlsafe_b64decode(text.removeprefix(prefix).encode())
    except ValueError as error:
        raise CryptoError(f"La clave {what} está incompleta o mal copiada.") from error
    if len(raw) != 32:
        raise CryptoError(f"La clave {what} está incompleta o mal copiada.")
    return raw


def new_key_pair() -> tuple[str, str]:
    """(pública, privada) como texto, listas para copiar y pegar."""
    private = X25519PrivateKey.generate()
    encode = lambda raw: base64.urlsafe_b64encode(raw).decode()  # noqa: E731
    return (
        PUBLIC_PREFIX + encode(_raw(private.public_key())),
        PRIVATE_PREFIX + encode(_raw(private)),
    )


def public_from_private(private_text: str) -> str:
    private = X25519PrivateKey.from_private_bytes(_decode(private_text, PRIVATE_PREFIX, "privada"))
    return PUBLIC_PREFIX + base64.urlsafe_b64encode(_raw(private.public_key())).decode()


def _key(shared: bytes, ephemeral: bytes, recipient: bytes) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=ephemeral + recipient, info=_INFO
    ).derive(shared)


def encrypt(data: bytes, public_text: str) -> bytes:
    recipient_raw = _decode(public_text, PUBLIC_PREFIX, "pública")
    recipient = X25519PublicKey.from_public_bytes(recipient_raw)
    ephemeral = X25519PrivateKey.generate()
    ephemeral_raw = _raw(ephemeral.public_key())
    key = _key(ephemeral.exchange(recipient), ephemeral_raw, recipient_raw)
    nonce = os.urandom(12)
    return MAGIC + ephemeral_raw + nonce + AESGCM(key).encrypt(nonce, data, MAGIC)


def is_encrypted(path: Path) -> bool:
    with path.open("rb") as f:
        return f.read(len(MAGIC)) == MAGIC


def decrypt(blob: bytes, private_text: str) -> bytes:
    if not blob.startswith(MAGIC):
        raise CryptoError("El archivo no es una copia cifrada de Casa en Orden.")
    private = X25519PrivateKey.from_private_bytes(_decode(private_text, PRIVATE_PREFIX, "privada"))
    start = len(MAGIC)
    ephemeral_raw, nonce = blob[start : start + 32], blob[start + 32 : start + 44]
    key = _key(
        private.exchange(X25519PublicKey.from_public_bytes(ephemeral_raw)),
        ephemeral_raw,
        _raw(private.public_key()),
    )
    try:
        return AESGCM(key).decrypt(nonce, blob[start + 44 :], MAGIC)
    except InvalidTag as error:
        raise CryptoError(
            "No se pudo abrir: la clave privada no corresponde a esta copia, "
            "o el archivo está dañado."
        ) from error
