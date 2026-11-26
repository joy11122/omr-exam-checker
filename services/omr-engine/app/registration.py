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
