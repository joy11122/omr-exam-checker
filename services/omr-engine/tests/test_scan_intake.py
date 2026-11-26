from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)
API_KEY = "test-omr-engine-key"


def make_image(
    size: tuple[int, int] = (1200, 1600),
    color: tuple[int, int, int] = (255, 255, 255),
    image_format: str = "PNG",
) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format=image_format)
    return buffer.getvalue()


def upload_image(
    content: bytes,
    content_type: str = "image/png",
    authorization: str | None = f"Bearer {API_KEY}",
):
    headers = {"Authorization": authorization} if authorization else {}
    return client.post(
        "/v1/scans/intake",
        headers=headers,
        files={"file": ("answer-sheet.png", content, content_type)},
    )


def test_health_endpoint_returns_service_status() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "omr-engine"}


def test_scan_intake_requires_configured_service_key(monkeypatch) -> None:
    monkeypatch.delenv("OMR_ENGINE_API_KEY", raising=False)

    response = upload_image(make_image())

    assert response.status_code == 503


def test_scan_intake_rejects_invalid_service_key(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image(), authorization="Bearer incorrect")

    assert response.status_code == 401


def test_scan_intake_accepts_valid_portrait_image(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image())

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"
    assert body["stage"] == "intake_validated"
    assert body["image"] == {"format": "PNG", "width": 1200, "height": 1600}
    assert body["quality"] == {
        "portrait": True,
        "contrast": False,
        "status": "manual_review",
    } or body["quality"]["status"] == "ready_for_calibration"
    assert len(body["sha256"]) == 64


def test_scan_intake_flags_low_contrast_for_manual_review(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image(color=(220, 220, 220)))

    assert response.status_code == 200
    assert response.json()["status"] == "review_required"
    assert response.json()["quality"]["contrast"] is False


def test_scan_intake_rejects_mismatched_declared_image_type(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image(), content_type="image/jpeg")

    assert response.status_code == 415


def test_scan_intake_rejects_unsupported_content_type(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image(), content_type="application/octet-stream")

    assert response.status_code == 415


def test_scan_intake_rejects_corrupt_image(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(b"not an image")

    assert response.status_code == 422


def test_scan_intake_rejects_small_image(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(make_image(size=(500, 700)))

    assert response.status_code == 422


def test_scan_intake_rejects_oversized_upload(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(b"x" * (10 * 1024 * 1024 + 1))

    assert response.status_code == 413
