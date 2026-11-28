"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";
import styles from "./publish-exam-results.module.css";

type Payload = {
  error?: string;
  candidates?: number;
  summary?: { published: number; emailsSent: number; emailFailed: number };
  hasMore?: boolean;
  nextCursor?: string | null;
};

export function PublishExamResults({ examId, disabled = false }: { examId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function publish() {
    if (!window.confirm("Publish the latest calculated results for this exam and email secure access links to every student with a registered email address?")) return;
    setBusy(true);
    setMessage("Checking student email addresses and publication settings…");
    setFailed(false);
    let cursor: string | null = null;
    const total = { published: 0, emailsSent: 0, emailFailed: 0 };
    try {
      const preflightResponse = await fetch(`/api/exams/${examId}/publish?preflight=1`, { method: "POST", cache: "no-store" });
      const preflight = await preflightResponse.json().catch(() => ({})) as Payload;
      if (!preflightResponse.ok) throw new Error(preflight.error ?? "Publication preflight failed.");
      setMessage(`Preflight passed for ${preflight.candidates ?? 0} students. Publishing in secure batches…`);
      while (true) {
        const url = cursor
          ? `/api/exams/${examId}/publish?afterResultId=${encodeURIComponent(cursor)}`
          : `/api/exams/${examId}/publish`;
        const response = await fetch(url, { method: "POST", cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as Payload;
        if (!response.ok) throw new Error(payload.error ?? "Could not publish results.");
        total.published += payload.summary?.published ?? 0;
        total.emailsSent += payload.summary?.emailsSent ?? 0;
        total.emailFailed += payload.summary?.emailFailed ?? 0;
        setMessage(`Published ${total.published}; email sent ${total.emailsSent}…`);
        if (!payload.hasMore) break;
        if (!payload.nextCursor || payload.nextCursor === cursor) throw new Error("Publication cursor did not advance. Retry publishing.");
        cursor = payload.nextCursor;
      }
      setMessage(`Published ${total.published} results. Emails sent: ${total.emailsSent}; email delivery failed: ${total.emailFailed}. You can publish again to retry failed notifications.`);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.wrap}>
    <button className="button button-secondary" type="button" disabled={disabled || busy} onClick={publish}>
      {busy ? <LoaderCircle size={15} className="spin"/> : <Send size={15}/>}
      {busy ? "Publishing…" : "Publish & notify"}
    </button>
    {message ? <p className={failed ? styles.error : styles.status} role="status" aria-live="polite">{message}</p> : null}
  </div>;
}
