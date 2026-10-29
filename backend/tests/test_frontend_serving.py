"""La API sirve el frontend compilado (modo producción) y comprime las respuestas."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def web(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>", encoding="utf-8")
    (dist / "assets" / "index-abc123.js").write_text("console.log(1);" * 200, encoding="utf-8")
    (tmp_path / "secreto.txt").write_text("no", encoding="utf-8")
    monkeypatch.setattr(get_settings(), "frontend_dist", dist)
    return TestClient(create_app())


def test_assets_are_cached_and_compressed(web: TestClient) -> None:
    response = web.get("/assets/index-abc123.js", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]
    assert response.headers["content-encoding"] == "gzip"


@pytest.mark.parametrize("path", ["/", "/pagos", "/calendario/2026-10"])
def test_app_routes_return_index_html(web: TestClient, path: str) -> None:
    response = web.get(path)

    assert response.status_code == 200
    assert "id=root" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_unknown_api_routes_stay_404(web: TestClient) -> None:
    response = web.get("/api/no-existe")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"


def test_files_outside_dist_are_not_served(web: TestClient) -> None:
    response = web.get("/..%2Fsecreto.txt")

    assert response.text != "no"
    assert "id=root" in response.text
