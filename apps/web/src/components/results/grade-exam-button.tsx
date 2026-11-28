"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, LoaderCircle } from "lucide-react";
import styles from "./grade-exam-button.module.css";

type BatchPayload = {
  error?: string;
  summary?: { candidates: number; graded: number; unchanged: number; skipped: number };
  hasMore?: boolean;
  nextCursor?: string | null;
};

export function GradeExamButton({ examId, disabled = false }: { examId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function handleGrade() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    let cursor: string | null = null;
    let candidates = 0;
    let graded = 0;
    let unchanged = 0;
    let skipped = 0;
    let batches = 0;
    try {
      while (true) {
        const endpoint = cursor
          ? `/api/exams/${examId}/grade?afterStudentId=${encodeURIComponent(cursor)}`
          : `/api/exams/${examId}/grade`;
        const response = await fetch(endpoint, { method: "POST", cache: "no-store" });
        const payload = await response.json() as BatchPayload;
        if (!response.ok) throw new Error(payload.error ?? "Grading could not be completed.");
        candidates += payload.summary?.candidates ?? 0;
        graded += payload.summary?.graded ?? 0;
        unchanged += payload.summary?.unchanged ?? 0;
        skipped += payload.summary?.skipped ?? 0;
        batches += 1;
        setMessage(`Processed ${candidates} candidates across ${batches} batches…`);
        if (!payload.hasMore) break;
        if (!payload.nextCursor || payload.nextCursor === cursor) {
          throw new Error("The grading batch cursor did not advance. Please retry.");
        }
        cursor = payload.nextCursor;
      }
      setMessage(`Completed: ${graded} calculated, ${unchanged} unchanged, ${skipped} skipped from ${candidates} candidates.`);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.action}>
      <button className="button button-primary" type="button" disabled={disabled || busy} onClick={handleGrade}>
        {busy ? <LoaderCircle size={15} className="spin" /> : <Calculator size={15} />}
        {busy ? "Calculating…" : "Calculate results"}
      </button>
      {message ? <p className={failed ? styles.error : styles.message} role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
