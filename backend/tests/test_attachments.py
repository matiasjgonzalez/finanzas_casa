from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Attachment, StoredFile, User
from app.services.attachments import MAX_ATTACHMENTS
from app.storage import DatabaseStorage
from tests.factories import HouseholdData, create_household, create_user, login

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 64
EXE = b"MZ\x90\x00" + b"\x00" * 64


@pytest.fixture
def home(db: Session) -> HouseholdData:
    return create_household(db)


@pytest.fixture
def member(db: Session, home: HouseholdData) -> User:
    return create_user(db, home.household)


@pytest.fixture
def member_client(client_factory: Callable[[], TestClient], member: User) -> TestClient:
    return login(client_factory(), member)


@pytest.fixture
def transaction_id(member_client: TestClient, home: HouseholdData) -> str:
    response = member_client.post(
        "/api/transactions",
        json={
            "description": "Farmacia",
            "amount": "5000",
            "occurred_on": "2026-10-10",
            "category_id": str(home.supermarket.id),
        },
    )
    return response.json()["id"]


def upload(client: TestClient, transaction_id: str, name: str, data: bytes):  # noqa: ANN201
    return client.post(
        f"/api/transactions/{transaction_id}/attachments",
        files={"file": (name, data, "application/octet-stream")},
    )


# --- Subida y validación -------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, data, content_type",
    [
        ("factura.pdf", PDF, "application/pdf"),
        ("ticket.PNG", PNG, "image/png"),
        ("foto.jpeg", JPEG, "image/jpeg"),
        ("foto.jpg", JPEG, "image/jpeg"),
        ("captura.webp", WEBP, "image/webp"),
    ],
)
def test_supported_formats_are_accepted(
    member_client: TestClient, transaction_id: str, name: str, data: bytes, content_type: str
) -> None:
    response = upload(member_client, transaction_id, name, data)

    assert response.status_code == 201, response.text
    assert response.json()["content_type"] == content_type
    assert response.json()["size_bytes"] == len(data)


@pytest.mark.parametrize(
    "name, data, message",
    [
        ("virus.pdf", EXE, "Formato no admitido"),
        ("notas.txt", b"hola", "Formato no admitido"),
        ("imagen.pdf", PNG, "no coincide con su extensión"),
        ("sin-extension", PDF, "Formato no admitido"),
        ("vacio.pdf", b"", "vacío"),
    ],
)
def test_invalid_files_are_rejected(
    member_client: TestClient, transaction_id: str, name: str, data: bytes, message: str
) -> None:
    response = upload(member_client, transaction_id, name, data)

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_files_over_the_size_limit_are_rejected(
    member_client: TestClient, transaction_id: str, db: Session
) -> None:
    too_big = PDF + b"0" * get_settings().max_upload_bytes

    response = upload(member_client, transaction_id, "grande.pdf", too_big)

    assert response.status_code == 422
    assert "supera el máximo de 10 MB" in response.json()["detail"]
    assert db.scalars(select(StoredFile)).all() == []


def test_physical_name_is_generated_by_the_server(
    member_client: TestClient, transaction_id: str, db: Session, storage: DatabaseStorage
) -> None:
    response = upload(member_client, transaction_id, "../../windows/evil.pdf", PDF)

    attachment = db.get(Attachment, response.json()["id"])
    assert attachment.original_filename == "evil.pdf"
    assert ".." not in attachment.storage_key
    assert storage.read(attachment.storage_key) == PDF


def test_attachment_limit_per_movement(member_client: TestClient, transaction_id: str) -> None:
    for i in range(MAX_ATTACHMENTS):
        assert upload(member_client, transaction_id, f"f{i}.pdf", PDF).status_code == 201

    response = upload(member_client, transaction_id, "uno-mas.pdf", PDF)

    assert response.status_code == 422


# --- Consulta y descarga -------------------------------------------------------------------


def test_attachment_is_listed_and_can_be_viewed_and_downloaded(
    member_client: TestClient, transaction_id: str
) -> None:
    attachment_id = upload(member_client, transaction_id, "Factura luz.pdf", PDF).json()["id"]

    detail = member_client.get(f"/api/transactions/{transaction_id}").json()
    inline = member_client.get(f"/api/attachments/{attachment_id}/content")
    download = member_client.get(f"/api/attachments/{attachment_id}/content?download=true")

    assert [a["original_filename"] for a in detail["attachments"]] == ["Factura luz.pdf"]
    assert member_client.get("/api/transactions").json()["items"][0]["attachments_count"] == 1
    assert inline.content == PDF
    assert inline.headers["content-type"] == "application/pdf"
    assert inline.headers["content-disposition"].startswith("inline")
    assert inline.headers["x-content-type-options"] == "nosniff"
    # Solo para mirar: aislado de la app, sin código ni cargas (la de la API no la pisa).
    policy = inline.headers["content-security-policy"]
    assert "default-src 'none'" in policy and policy.endswith("sandbox")
    assert download.headers["content-disposition"] == (
        "attachment; filename*=UTF-8''Factura%20luz.pdf"
    )


def test_other_members_cannot_view_upload_or_delete_but_the_admin_can_view(
    client_factory: Callable[[], TestClient],
    member_client: TestClient,
    db: Session,
    home: HouseholdData,
    transaction_id: str,
) -> None:
    attachment_id = upload(member_client, transaction_id, "f.pdf", PDF).json()["id"]
    sibling = login(client_factory(), create_user(db, home.household))
    admin = login(client_factory(), home.admin)

    # El comprobante de un pago ajeno no existe para otro integrante.
    assert sibling.get(f"/api/attachments/{attachment_id}/content").status_code == 404
    assert upload(sibling, transaction_id, "otro.pdf", PDF).status_code == 404
    assert sibling.delete(f"/api/attachments/{attachment_id}").status_code == 404
    assert admin.get(f"/api/attachments/{attachment_id}/content").status_code == 200


def test_another_household_cannot_view_upload_or_delete(
    client_factory: Callable[[], TestClient],
    member_client: TestClient,
    db: Session,
    transaction_id: str,
) -> None:
    attachment_id = upload(member_client, transaction_id, "f.pdf", PDF).json()["id"]
    intruder = login(client_factory(), create_household(db, name="Ajeno").admin)

    assert intruder.get(f"/api/attachments/{attachment_id}/content").status_code == 404
    assert intruder.delete(f"/api/attachments/{attachment_id}").status_code == 404
    assert upload(intruder, transaction_id, "f.pdf", PDF).status_code == 404


def test_anonymous_users_cannot_download(
    member_client: TestClient, client: TestClient, transaction_id: str
) -> None:
    attachment_id = upload(member_client, transaction_id, "f.pdf", PDF).json()["id"]

    assert client.get(f"/api/attachments/{attachment_id}/content").status_code == 401


# --- Eliminación ---------------------------------------------------------------------------


def test_deleting_an_attachment_removes_the_file(
    member_client: TestClient, transaction_id: str, db: Session
) -> None:
    attachment_id = upload(member_client, transaction_id, "f.pdf", PDF).json()["id"]
    key = db.get(Attachment, attachment_id).storage_key

    assert member_client.delete(f"/api/attachments/{attachment_id}").status_code == 204

    assert db.get(StoredFile, key) is None
    assert db.get(Attachment, attachment_id) is None


def test_deleting_a_movement_removes_its_files(
    member_client: TestClient, transaction_id: str, db: Session
) -> None:
    upload(member_client, transaction_id, "a.pdf", PDF)
    upload(member_client, transaction_id, "b.png", PNG)
    keys = list(db.scalars(select(Attachment.storage_key)))

    member_client.delete(f"/api/transactions/{transaction_id}")

    assert len(keys) == 2
    assert all(db.get(StoredFile, key) is None for key in keys)
    assert db.scalars(select(Attachment)).all() == []
