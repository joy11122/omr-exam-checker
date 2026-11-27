from io import BytesIO

import cv2
from fastapi.testclient import TestClient
import numpy as np
from PIL import Image, ImageDraw

from app.main import app

client = TestClient(app)
API_KEY = "test-omr-engine-key"


def make_image(
    size: tuple[int, int] = (1200, 1600),
    color: tuple[int, int, int] = (255, 255, 255),
    image_format: str = "PNG",
    marks: bool = True,
) -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", size, color)
    if marks:
        draw = ImageDraw.Draw(image)
        draw.rectangle((30, 30, 90, 90), fill=(0, 0, 0))
        draw.rectangle((size[0] - 90, 30, size[0] - 30, 90), fill=(0, 0, 0))
        draw.rectangle((30, size[1] - 90, 90, size[1] - 30), fill=(0, 0, 0))
        draw.rectangle(
            (size[0] - 90, size[1] - 90, size[0] - 30, size[1] - 30),
            fill=(0, 0, 0),
        )
    image.save(buffer, format=image_format)
    return buffer.getvalue()


def upload_image(
    content: bytes,
    endpoint: str = "/v1/scans/intake",
    content_type: str = "image/png",
    authorization: str | None = f"Bearer {API_KEY}",
):
    headers = {"Authorization": authorization} if authorization else {}
    return client.post(
        endpoint,
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
    assert body["quality"]["portrait"] is True
    assert body["quality"]["contrast"] is True
    assert body["quality"]["status"] == "ready_for_calibration"
    assert len(body["sha256"]) == 64


def test_scan_intake_flags_low_contrast_for_manual_review(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    # No registration marks: they would artificially increase the global contrast
    # of an otherwise flat image and invalidate this specific fixture.
    response = upload_image(make_image(color=(220, 220, 220), marks=False))

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


def test_registration_marks_detect_four_corners(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(
        make_image(),
        endpoint="/v1/scans/registration-marks",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "detected"
    assert body["stage"] == "registration_marks_detected"
    assert body["detected_count"] == 4
    assert set(body["marks"]) == {
        "top_left",
        "top_right",
        "bottom_left",
        "bottom_right",
    }
    assert body["minimum_confidence"] > 0.8
    assert body["next_step"] == "perspective_correction"


def test_registration_marks_require_review_when_corners_are_missing(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(
        make_image(marks=False),
        endpoint="/v1/scans/registration-marks",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "review_required"
    assert body["detected_count"] == 0
    assert body["minimum_confidence"] is None
    assert body["next_step"] == "manual_alignment"


def test_registration_marks_endpoint_requires_service_auth(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(
        make_image(),
        endpoint="/v1/scans/registration-marks",
        authorization="Bearer wrong",
    )

    assert response.status_code == 401



def make_perspective_image() -> bytes:
    original = Image.open(BytesIO(make_image())).convert("RGB")
    pixels = np.asarray(original)
    height, width = pixels.shape[:2]
    source = np.float32(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]
    )
    destination = np.float32(
        [[75, 45], [1125, 70], [1160, 1535], [35, 1560]]
    )
    transform = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(
        pixels,
        transform,
        (width, height),
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    buffer = BytesIO()
    Image.fromarray(warped).save(buffer, format="PNG")
    return buffer.getvalue()


def test_perspective_correction_rectifies_skewed_a4_sheet(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(
        make_perspective_image(),
        endpoint="/v1/scans/perspective-correction",
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-omr-status"] == "corrected"
    assert response.headers["x-omr-registration-marks"] == "4"
    assert response.headers["x-omr-width"] == "1240"
    assert response.headers["x-omr-height"] == "1754"
    corrected = Image.open(BytesIO(response.content))
    assert corrected.size == (1240, 1754)
    assert corrected.format == "JPEG"


def test_perspective_correction_requires_all_registration_marks(monkeypatch) -> None:
    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)

    response = upload_image(
        make_image(marks=False),
        endpoint="/v1/scans/perspective-correction",
    )

    assert response.status_code == 422
    assert "All four registration marks" in response.json()["detail"]
