from io import BytesIO

import cv2
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.bubble_recognition import recognize_bubbles
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


def make_bubble_layout() -> list[dict[str, float | int | str]]:
    return [
        {"question_number": 1, "option": option, "x": x, "y": 0.30, "radius": 0.012}
        for option, x in zip(("A", "B", "C", "D"), (0.25, 0.31, 0.37, 0.43), strict=True)
    ]


def make_bubble_image(filled: tuple[str, ...] = ("A",)) -> Image.Image:
    image = Image.new("RGB", (1200, 1600), "white")
    draw = ImageDraw.Draw(image)
    for item in make_bubble_layout():
        cx = int(float(item["x"]) * image.width)
        cy = int(float(item["y"]) * image.height)
        radius = int(float(item["radius"]) * min(image.size))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline="black", width=3)
        if item["option"] in filled:
            draw.ellipse((cx - radius + 3, cy - radius + 3, cx + radius - 3, cy + radius - 3), fill="black")
    return image


def test_bubble_recognition_reads_one_filled_answer() -> None:
    result = recognize_bubbles(make_bubble_image(), make_bubble_layout())

    assert result["stage"] == "bubble_recognition"
    assert result["status"] == "recognized"
    assert result["calibration_required"] is True
    assert result["questions"][0]["answer"] == "A"
    assert result["questions"][0]["status"] == "recognized"
    assert result["summary"]["recognized"] == 1


def test_bubble_recognition_flags_blank_and_multiple_answers() -> None:
    blank = recognize_bubbles(make_bubble_image(()), make_bubble_layout())
    multiple = recognize_bubbles(make_bubble_image(("A", "C")), make_bubble_layout())

    assert blank["questions"][0]["status"] == "blank"
    assert blank["questions"][0]["answer"] is None
    assert multiple["questions"][0]["status"] == "multiple"
    assert multiple["questions"][0]["answer"] is None


def test_bubble_recognition_endpoint_requires_service_auth(monkeypatch) -> None:
    import json

    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)
    buffer = BytesIO()
    make_bubble_image().save(buffer, format="PNG")
    response = client.post(
        "/v1/scans/bubbles",
        headers={"Authorization": "Bearer wrong"},
        files={"file": ("sheet.png", buffer.getvalue(), "image/png")},
        data={"layout": json.dumps({"bubbles": make_bubble_layout()})},
    )

    assert response.status_code == 401


def test_bubble_recognition_endpoint_rejects_invalid_layout(monkeypatch) -> None:
    import json

    monkeypatch.setenv("OMR_ENGINE_API_KEY", API_KEY)
    buffer = BytesIO()
    make_bubble_image().save(buffer, format="PNG")
    response = client.post(
        "/v1/scans/bubbles",
        headers={"Authorization": f"Bearer {API_KEY}"},
        files={"file": ("sheet.png", buffer.getvalue(), "image/png")},
        data={"layout": json.dumps({"bubbles": [{"question_number": 1, "option": "A", "x": 0.2, "y": 0.3, "radius": 0.012}]})},
    )

    assert response.status_code == 422
