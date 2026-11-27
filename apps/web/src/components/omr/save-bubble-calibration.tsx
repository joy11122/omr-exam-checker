"use client";

import { useState } from "react";
import { LoaderCircle, Ruler, CheckCircle2 } from "lucide-react";

type BubbleCoordinate = {
  question_number: number;
  option: "A" | "B" | "C" | "D";
  x: number;
  y: number;
  radius: number;
};

export function SaveBubbleCalibration({ examId, subjectId }: { examId: string; subjectId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function saveCalibration() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setSaved(false);
    try {
      const papers = Array.from(document.querySelectorAll<HTMLElement>("[data-omr-paper]"));
      if (papers.length === 0) throw new Error("The printed sheet preview is not available.");

      const pages = papers.map((paper, pageNumber) => {
        const pageRect = paper.getBoundingClientRect();
        if (pageRect.width < 100 || pageRect.height < 100) {
          throw new Error("A sheet page is not measurable. Refresh the preview and try again.");
        }
        const bubbles = Array.from(paper.querySelectorAll<HTMLElement>("[data-question][data-option]"))
          .map((element): BubbleCoordinate => {
            const rect = element.getBoundingClientRect();
            const questionNumber = Number(element.dataset.question);
            const option = element.dataset.option;
            if (!Number.isInteger(questionNumber) || !["A", "B", "C", "D"].includes(option ?? "")) {
              throw new Error("The preview contains an invalid bubble label.");
            }
            return {
              question_number: questionNumber,
              option: option as BubbleCoordinate["option"],
              x: Number(((rect.left + rect.width / 2 - pageRect.left) / pageRect.width).toFixed(7)),
              y: Number(((rect.top + rect.height / 2 - pageRect.top) / pageRect.height).toFixed(7)),
              radius: Number((rect.width / 2 / Math.min(pageRect.width, pageRect.height)).toFixed(7)),
            };
          });
        return { pageNumber, bubbles };
      });

      const response = await fetch(`/api/exams/${examId}/subjects/${subjectId}/bubble-calibration`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      const payload = await response.json() as { success?: boolean; calibratedPages?: number; calibratedQuestions?: number; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save the calibration.");
      setSaved(true);
      setMessage(`Saved ${payload.calibratedPages} page(s) and ${payload.calibratedQuestions} question(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the calibration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="omr-calibration-control">
      <button className="button button-secondary" type="button" onClick={() => void saveCalibration()} disabled={busy}>
        {busy ? <><LoaderCircle className="spin" size={15} /> Measuring bubbles…</> : <><Ruler size={15} /> Calibrate this template</>}
      </button>
      {message ? <p className={saved ? "omr-calibration-message is-saved" : "omr-calibration-message"} role="status">
        {saved ? <CheckCircle2 size={14} /> : null}{message}
      </p> : null}
      <p className="helper-copy">Coordinates are measured from the rendered A4 preview for every page. Print at 100% / actual size; printer scaling and camera alignment still require physical validation.</p>
    </div>
  );
}
