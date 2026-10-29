"""Configuración para el servidor (Railway): dirección de la base e IP real detrás del proxy."""

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.deps import client_ip
from app.core.config import Settings, get_settings


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://u:p@host:5432/db",
        "postgres://u:p@host:5432/db",
        "postgresql+psycopg://u:p@host:5432/db",
    ],
)
def test_database_url_from_railway_uses_psycopg(given: str) -> None:
    settings = Settings(database_url=given, _env_file=None)

    assert settings.database_url == "postgresql+psycopg://u:p@host:5432/db"


def request(headers: dict[str, str], peer: str = "10.0.0.1") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 1234),
        }
    )


def test_without_proxy_the_headers_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "trust_proxy", False)

    # Sin proxy, cualquiera podría inventar estos encabezados: se usa la conexión real.
    assert client_ip(request({"X-Real-IP": "1.2.3.4", "X-Forwarded-For": "5.6.7.8"})) == "10.0.0.1"


def test_behind_the_proxy_the_real_ip_is_used(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "trust_proxy", True)

    assert client_ip(request({"X-Real-IP": "1.2.3.4"})) == "1.2.3.4"
    # Sin X-Real-IP: la última de X-Forwarded-For (la agrega el proxy; las anteriores no son
    # confiables porque las puede mandar el cliente).
    assert client_ip(request({"X-Forwarded-For": "6.6.6.6, 1.2.3.4"})) == "1.2.3.4"
    assert client_ip(request({})) == "10.0.0.1"


def test_production_mode_hides_docs_and_uses_secure_cookies(
    monkeypatch: pytest.MonkeyPatch, client_factory
) -> None:  # noqa: ANN001
    from app.main import create_app

    monkeypatch.setattr(get_settings(), "app_env", "production")
    app = TestClient(create_app())

    assert app.get("/api/docs").status_code == 404
    assert app.get("/api/openapi.json").status_code == 404
    assert get_settings().cookie_secure is True
    assert "max-age" in app.get("/api/health").headers["strict-transport-security"]


def test_on_railway_without_a_volume_the_deploy_does_not_go_live(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:  # noqa: ANN001
    from app.api.routes.health import storage_problem

    volume = tmp_path / "data"
    monkeypatch.setattr(get_settings(), "storage_dir", volume / "storage")

    assert storage_problem({}) is None  # fuera de Railway no se exige nada
    assert "No hay un volumen" in storage_problem({"RAILWAY_ENVIRONMENT": "production"})
    assert "No hay un volumen" in storage_problem({"RAILWAY_PROJECT_ID": "abc"})
    assert "no está dentro del volumen" in storage_problem(
        {"RAILWAY_ENVIRONMENT": "production", "RAILWAY_VOLUME_MOUNT_PATH": str(tmp_path / "otro")}
    )
    assert (
        storage_problem(
            {"RAILWAY_ENVIRONMENT": "production", "RAILWAY_VOLUME_MOUNT_PATH": str(volume)}
        )
        is None
    )

    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.delenv("RAILWAY_VOLUME_MOUNT_PATH", raising=False)
    response = client.get("/api/health")
    assert response.status_code == 503  # Railway no pone en marcha esta versión
    assert response.json()["storage"] == "not persistent"
