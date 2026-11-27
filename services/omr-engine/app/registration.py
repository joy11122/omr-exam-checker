# ruff: noqa: I001
from __future__ import annotations

from math import log
from typing import Any

import cv2
import numpy as np
from PIL import Image


CORNERS = {
    "top_left": (0.05, 0.05),
    "top_right": (0.95, 0.05),
    "bottom_left": (0.05, 0.95),
    "bottom_right": (0.95, 0.95),
}


def detect_registration_marks(image: Image.Image) -> dict[str, Any]:
    """Detect the four solid, square registration marks used by the A4 template.

    Coordinates are returned in both source pixels and normalized 0..1 units.
    This is a localization step only; it deliberately does not warp or grade a sheet.
    """
    rgb = image.convert("RGB")
    width, height = rgb.size
    gray = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU
    )
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    min_side = min(width, height)
    min_mark_side = max(8, int(min_side * 0.012))
    max_mark_side = int(min_side * 0.12)
    candidates: list[dict[str, float | int]] = []

    for contour in contours:
        x, y, box_width, box_height = cv2.boundingRect(contour)
        if not (min_mark_side <= box_width <= max_mark_side):
            continue
        if not (min_mark_side <= box_height <= max_mark_side):
            continue
        aspect = box_width / box_height
        if not 0.75 <= aspect <= 1.33:
            continue
        box_area = box_width * box_height
        if box_area / (width * height) < 0.0001:
            continue
        fill_ratio = cv2.contourArea(contour) / box_area
        if fill_ratio < 0.82:
            continue

        center_x = (x + box_width / 2) / width
        center_y = (y + box_height / 2) / height
        shape_score = max(0.0, 1.0 - abs(log(aspect)))
        confidence = min(0.99, 0.72 * fill_ratio + 0.28 * shape_score)
        candidates.append({
            "x": x,
            "y": y,
            "width": box_width,
            "height": box_height,
            "center_x": center_x,
            "center_y": center_y,
            "confidence": confidence,
        })

    marks: dict[str, dict[str, float | int]] = {}
    used: set[int] = set()
    candidate_limit = 0.36

    for corner, expected in CORNERS.items():
        ranked: list[tuple[float, int, dict[str, float | int]]] = []
        for index, candidate in enumerate(candidates):
            if index in used:
                continue
            dx = float(candidate["center_x"]) - expected[0]
            dy = float(candidate["center_y"]) - expected[1]
            distance = (dx * dx + dy * dy) ** 0.5
            if distance <= candidate_limit:
                ranked.append((distance, index, candidate))
        if not ranked:
            continue

        distance, index, candidate = min(ranked, key=lambda item: item[0])
        used.add(index)
        confidence = float(candidate["confidence"]) * max(
            0.5, 1.0 - distance / candidate_limit * 0.35
        )
        marks[corner] = {
            "x": int(candidate["x"]),
            "y": int(candidate["y"]),
            "width": int(candidate["width"]),
            "height": int(candidate["height"]),
            "center_x": round(float(candidate["center_x"]), 5),
            "center_y": round(float(candidate["center_y"]), 5),
            "confidence": round(confidence, 4),
        }

    complete = len(marks) == 4
    return {
        "status": "detected" if complete else "review_required",
        "stage": "registration_marks_detected",
        "image": {"width": width, "height": height},
        "detected_count": len(marks),
        "expected_count": 4,
        "marks": marks,
        "minimum_confidence": (
            min(float(mark["confidence"]) for mark in marks.values())
            if complete
            else None
        ),
        "next_step": "perspective_correction" if complete else "manual_alignment",
    }

def correct_perspective(
    image: Image.Image,
    marks: dict[str, dict[str, float | int]],
    output_width: int = 1240,
    output_height: int = 1754,
) -> Image.Image:
    """Rectify a sheet to a canonical A4 portrait raster using its four mark centers.

    The output dimensions represent an A4 page at approximately 150 DPI. Target
    coordinates preserve the printed template's 5 mm edge offset and 7 mm mark size.
    """
    if set(marks) != set(CORNERS):
        raise ValueError("All four registration marks are required")
    if output_width < 800 or output_height < 1000:
        raise ValueError("The corrected output dimensions are too small")

    source_width, source_height = image.size
    source_points = np.array(
        [
            [
                float(marks[name]["center_x"]) * source_width,
                float(marks[name]["center_y"]) * source_height,
            ]
            for name in ("top_left", "top_right", "bottom_right", "bottom_left")
        ],
        dtype=np.float32,
    )
    if not np.isfinite(source_points).all():
        raise ValueError("Registration mark coordinates are invalid")
    if (
        np.any(source_points[:, 0] < 0)
        or np.any(source_points[:, 0] >= source_width)
        or np.any(source_points[:, 1] < 0)
        or np.any(source_points[:, 1] >= source_height)
    ):
        raise ValueError("Registration mark coordinates are outside the image")

    polygon = source_points.astype(np.int32).reshape((-1, 1, 2))
    if not cv2.isContourConvex(polygon):
        raise ValueError("Registration marks do not form a valid page quadrilateral")
    page_area = abs(cv2.contourArea(polygon))
    if page_area < source_width * source_height * 0.2:
        raise ValueError("Detected page area is too small for reliable correction")

    # The printed mark centers are 8.5 mm from each A4 edge (5 mm inset + half
    # of the 7 mm mark). Map those centers to the matching canonical positions.
    left = output_width * (8.5 / 210)
    right = output_width * (201.5 / 210)
    top = output_height * (8.5 / 297)
    bottom = output_height * (288.5 / 297)
    destination_points = np.array(
        [[left, top], [right, top], [right, bottom], [left, bottom]],
        dtype=np.float32,
    )

    transform = cv2.getPerspectiveTransform(source_points, destination_points)
    if not np.isfinite(transform).all() or abs(float(np.linalg.det(transform))) < 1e-12:
        raise ValueError("Could not calculate a stable perspective transform")

    corrected = cv2.warpPerspective(
        cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR),
        transform,
        (output_width, output_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    return Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))

