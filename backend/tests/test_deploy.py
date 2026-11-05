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
    monkeypatch.setattr(get_settings(), "storage_backend", "local")
    monkeypatch.setattr(get_settings(), "storage_dir", volume / "storage")

    assert storage_problem({}) is None  # fuera de Railway no se exige nada
    assert "STORAGE_BACKEND=database" in storage_problem({"RENDER": "true"})
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


def test_with_files_in_the_database_no_volume_is_needed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.routes.health import storage_problem

    monkeypatch.setattr(get_settings(), "storage_backend", "database")
    assert storage_problem({"RENDER": "true"}) is None
    assert storage_problem({"RAILWAY_ENVIRONMENT": "production"}) is None

    monkeypatch.setenv("RENDER", "true")
    assert client.get("/api/health").json()["storage"] == "ok"


def test_daily_backup_workflow_runs_the_cloud_backup() -> None:
    """La copia diaria de GitHub usa el mismo comando que respaldo-nube.cmd y el secreto."""
    import yaml

    from app.core.config import PROJECT_ROOT

    workflow = yaml.safe_load(
        (PROJECT_ROOT / ".github/workflows/respaldo.yml").read_text(encoding="utf-8")
    )
    triggers = workflow[True]  # YAML lee la clave "on" como verdadero
    assert triggers["schedule"] == [{"cron": "0 6 * * *"}]
    assert "workflow_dispatch" in triggers
    assert workflow["permissions"] == {"contents": "read"}

    steps = {
        step.get("id") or step.get("name"): step
        for step in workflow["jobs"]["respaldo"]["steps"]
        if "id" in step or "name" in step
    }
    backup_step = steps["copia"]
    assert "python -m app.backup --nube crear" in backup_step["run"]
    assert backup_step["env"]["CLOUD_DATABASE_URL"] == "${{ secrets.CLOUD_DATABASE_URL }}"
    # Siempre cifrada: con la clave pública, y solo se suben archivos .cifrado.
    assert backup_step["env"]["BACKUP_PUBLIC_KEY"] == "${{ secrets.BACKUP_PUBLIC_KEY }}"
    saved = steps["Guardar la copia cifrada (14 días)"]["with"]
    assert saved["path"] == "respaldos/nube/*.cifrado"
    assert saved["retention-days"] == 14


def test_ci_runs_tests_and_dependency_audits_before_publishing() -> None:
    """GitHub corre las pruebas y revisa las librerías en cada cambio (Railway espera el OK)."""
    import yaml

    from app.core.config import PROJECT_ROOT

    workflow = yaml.safe_load(
        (PROJECT_ROOT / ".github/workflows/pruebas.yml").read_text(encoding="utf-8")
    )
    assert workflow[True]["push"] == {"branches": ["main"]}
    runs = {
        job: " ".join(step.get("run", "") for step in spec["steps"])
        for job, spec in workflow["jobs"].items()
    }
    assert "pytest" in runs["servidor"] and "pip-audit -r requirements.txt" in runs["servidor"]
    assert "npm test" in runs["pantallas"] and "npm audit --omit=dev" in runs["pantallas"]
    # La base de las pruebas de GitHub cumple la misma regla que la local: termina en _test.
    assert workflow["jobs"]["servidor"]["env"]["TEST_DATABASE_URL"].endswith("_test")
