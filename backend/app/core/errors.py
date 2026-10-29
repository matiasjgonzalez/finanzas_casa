"""Errores de la lógica del negocio.

Los servicios lanzan estos errores sin saber nada de HTTP; main.py los convierte en respuestas
JSON con el código adecuado y un mensaje pensado para mostrarse al usuario.
"""


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ValidationError(DomainError):
    """Datos válidos en formato pero que no cumplen una regla del negocio."""

    status_code = 422


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class AuthenticationError(DomainError):
    status_code = 401


class PermissionDeniedError(DomainError):
    status_code = 403


class TooManyAttemptsError(DomainError):
    status_code = 429

    def __init__(self, message: str, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds
