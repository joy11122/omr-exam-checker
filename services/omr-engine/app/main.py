import hashlib
import hmac
import os
from io import BytesIO
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from app.registration import correct_perspective, detect_registration_marks

app = FastAPI(
    title="OMR Engine",
    version="0.3.0",
    docs_url="/docs",
    redoc_url=None,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MIN_IMAGE_WIDTH = 800
MIN_IMAGE_HEIGHT = 1000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


class ScanIntakeResponse(BaseModel):
    status: Literal["accepted", "review_required"]
    stage: Literal["intake_validated"]
    sha256: str
    image: dict[str, int | str]
    quality: dict[str, bool | str]


async def require_service_key(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    configured_key = os.environ.get("OMR_ENGINE_API_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="OMR engine authentication is not configured")
    supplied_key = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not supplied_key or not hmac.compare_digest(supplied_key, configured_key):
        raise HTTPException(status_code=401, detail="Invalid service credentials")


def decode_image(contents: bytes, declared_type: str) -> Image.Image:
    expected_format = ALLOWED_CONTENT_TYPES.get(declared_type)
    if not expected_format:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP image")
    try:
        with Image.open(BytesIO(contents)) as source:
            image_format = source.format
            if image_format not in ALLOWED_FORMATS or image_format != expected_format:
                raise HTTPException(
                    status_code=415,
                    detail="Image content does not match its declared type",
                )
            if getattr(source, "is_animated", False):
                raise HTTPException(status_code=415, detail="Animated images are not supported")
            width, height = source.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="Image dimensions exceed the 20 megapixel limit",
                )
            source.verify()

        with Image.open(BytesIO(contents)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            width, height = image.size
            if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
                raise HTTPException(
                    status_code=422,
                    detail=f"Image must be at least {MIN_IMAGE_WIDTH} × {MIN_IMAGE_HEIGHT} pixels",
                )
            return image
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=422,
            detail="The uploaded file is not a valid readable image",
        ) from None


async def read_upload(file: UploadFile) -> tuple[bytes, Image.Image]:
    declared_type = (file.content_type or "").lower()
    if declared_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP image")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB upload limit")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded image is empty")
    return contents, decode_image(contents, declared_type)


@app.get("/health", tags=["operations"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "omr-engine"}


@app.post(
    "/v1/scans/intake",
    response_model=ScanIntakeResponse,
    tags=["scans"],
    dependencies=[Depends(require_service_key)],
)
async def validate_scan_image(
    file: Annotated[UploadFile, File(description="A photographed or scanned OMR answer sheet")],
) -> ScanIntakeResponse:
    contents, image = await read_upload(file)
    width, height = image.size
    extrema = image.convert("L").getextrema()
    contrast = extrema[1] - extrema[0]
    is_portrait = height > width
    has_usable_contrast = contrast >= 80
    quality_status = (
        "ready_for_calibration" if is_portrait and has_usable_contrast else "manual_review"
    )
    return ScanIntakeResponse(
        status="accepted" if quality_status == "ready_for_calibration" else "review_required",
        stage="intake_validated",
        sha256=hashlib.sha256(contents).hexdigest(),
        image={"format": Image.open(BytesIO(contents)).format or "unknown",
               "width": width, "height": height},
        quality={
            "portrait": is_portrait,
            "contrast": has_usable_contrast,
            "status": quality_status,
        },
    )


@app.post(
    "/v1/scans/registration-marks",
    tags=["scans"],
    dependencies=[Depends(require_service_key)],
)
async def locate_registration_marks(
    file: Annotated[UploadFile, File(description="A validated A4 OMR answer sheet image")],
) -> dict:
    _, image = await read_upload(file)
    return detect_registration_marks(image)



@app.post(
    "/v1/scans/perspective-correction",
    response_class=Response,
    tags=["scans"],
    dependencies=[Depends(require_service_key)],
)
async def correct_scan_perspective(
    file: Annotated[UploadFile, File(description="A photographed or scanned A4 OMR answer sheet")],
) -> Response:
    _, image = await read_upload(file)
    detection = detect_registration_marks(image)
    if detection["status"] != "detected":
        raise HTTPException(
            status_code=422,
            detail="All four registration marks must be visible. Adjust the sheet and try again.",
        )
    if detection["minimum_confidence"] is None or detection["minimum_confidence"] < 0.7:
        raise HTTPException(
            status_code=422,
            detail="Registration marks are unclear. Use manual alignment before correction.",
        )

    try:
        corrected = correct_perspective(image, detection["marks"])
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="The sheet corners do not form a reliable page outline.",
        ) from None

    output = BytesIO()
    corrected.save(output, format="JPEG", quality=92, optimize=True)
    return Response(
        content=output.getvalue(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "X-OMR-Status": "corrected",
            "X-OMR-Width": str(corrected.width),
            "X-OMR-Height": str(corrected.height),
            "X-OMR-Registration-Marks": str(detection["detected_count"]),
            "X-OMR-Minimum-Confidence": str(detection["minimum_confidence"]),
        },
    )
