"""Contraseñas y tokens.

- Contraseñas: Argon2id (recomendado por OWASP). El hash incluye su propia sal y parámetros.
- Tokens de sesión y CSRF: aleatorios criptográficamente seguros. En la base se guarda
  solo su SHA-256: si alguien obtiene una copia de la base, no puede usar las sesiones.
"""

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# Hash de una contraseña que nadie conoce. Se verifica contra él cuando el usuario no existe,
# para que la respuesta tarde lo mismo y no revele qué nombres de usuario existen.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True si el hash se creó con parámetros más débiles que los actuales."""
    return _hasher.check_needs_rehash(password_hash)


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_match(token: str, expected_hash: str) -> bool:
    # compare_digest: comparación en tiempo constante (no filtra información por la demora).
    return hmac.compare_digest(hash_token(token), expected_hash)
