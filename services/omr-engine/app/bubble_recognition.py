from __future__ import annotations

from collections import defaultdict
from typing import Any

import cv2
import numpy as np
from PIL import Image


def recognize_bubbles(
    image: Image.Image,
    bubbles: list[dict[str, Any]],
    *,
    dark_threshold: int = 145,
    fill_threshold: float = 0.24,
) -> dict[str, Any]:
    """Read a supplied, normalized bubble map from a rectified sheet image.

    This intentionally requires calibrated bubble coordinates. It does not infer
    page layout or question positions from arbitrary photographs.
    """
    if not 80 <= dark_threshold <= 220:
        raise ValueError("The grayscale threshold must be between 80 and 220")
    if not 0.05 <= fill_threshold <= 0.8:
        raise ValueError("The fill threshold is outside the supported range")

    gray = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
    height, width = gray.shape
    min_dimension = min(width, height)
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple[int, str]] = set()

    for item in bubbles:
        question = int(item["question_number"])
        option = str(item["option"]).upper()
        x, y, radius = float(item["x"]), float(item["y"]), float(item["radius"])
        if not 0 <= x <= 1 or not 0 <= y <= 1 or not 0.003 <= radius <= 0.05:
            raise ValueError("Bubble coordinates or radius are outside normalized bounds")
        if (question, option) in seen:
            raise ValueError("Each question can contain an option only once")
        seen.add((question, option))
        grouped[question].append(item)

    if not grouped:
        raise ValueError("At least one question with bubble coordinates is required")

    questions: list[dict[str, Any]] = []
    for question_number in sorted(grouped):
        candidates = sorted(grouped[question_number], key=lambda item: str(item["option"]))
        if len(candidates) < 2 or len(candidates) > 5:
            raise ValueError("Each question must have between two and five bubbles")

        scores: list[dict[str, Any]] = []
        for item in candidates:
            cx = int(round(float(item["x"]) * width))
            cy = int(round(float(item["y"]) * height))
            radius = max(4, int(round(float(item["radius"]) * min_dimension)))
            x1, x2 = max(0, cx - radius), min(width, cx + radius + 1)
            y1, y2 = max(0, cy - radius), min(height, cy + radius + 1)
            if x1 == 0 or y1 == 0 or x2 == width or y2 == height:
                scores.append({"option": str(item["option"]), "fill_ratio": 0.0, "confidence": 0.0})
                continue

            yy, xx = np.ogrid[y1:y2, x1:x2]
            distance = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            inner = distance <= radius * 0.58
            if not np.any(inner):
                raise ValueError("Bubble radius is too small for this image resolution")
            crop = gray[y1:y2, x1:x2]
            dark_pixels = crop <= dark_threshold
            fill_ratio = float(np.count_nonzero(dark_pixels & inner) / np.count_nonzero(inner))
            confidence = min(1.0, abs(fill_ratio - fill_threshold) / max(fill_threshold, 1e-6))
            scores.append({
                "option": str(item["option"]),
                "fill_ratio": round(fill_ratio, 4),
                "confidence": round(confidence, 4),
            })

        filled = [score for score in scores if score["fill_ratio"] >= fill_threshold]
        ranked = sorted(scores, key=lambda score: score["fill_ratio"], reverse=True)
        if len(filled) > 1:
            status, answer = "multiple", None
            confidence = min(score["confidence"] for score in filled)
        elif len(filled) == 1:
            selected = filled[0]
            runner_up = ranked[1]["fill_ratio"] if len(ranked) > 1 else 0.0
            margin = selected["fill_ratio"] - runner_up
            if margin < 0.12:
                status, answer = "uncertain", None
                confidence = round(max(0.0, margin / 0.12), 4)
            else:
                status, answer = "recognized", selected["option"]
                confidence = round(min(selected["confidence"], margin / 0.35, 1.0), 4)
        else:
            strongest = ranked[0]
            if strongest["fill_ratio"] >= fill_threshold * 0.65:
                status, answer = "uncertain", None
                confidence = round(strongest["fill_ratio"] / fill_threshold, 4)
            else:
                status, answer = "blank", None
                confidence = round(min(1.0, (fill_threshold - strongest["fill_ratio"]) / fill_threshold), 4)

        questions.append({
            "question_number": question_number,
            "answer": answer,
            "status": status,
            "confidence": confidence,
            "options": scores,
        })

    counts = {
        status: sum(1 for question in questions if question["status"] == status)
        for status in ("recognized", "blank", "multiple", "uncertain")
    }
    return {
        "stage": "bubble_recognition",
        "status": "review_required" if counts["blank"] or counts["multiple"] or counts["uncertain"] else "recognized",
        "calibration_required": True,
        "image": {"width": width, "height": height},
        "question_count": len(questions),
        "summary": counts,
        "questions": questions,
    }
