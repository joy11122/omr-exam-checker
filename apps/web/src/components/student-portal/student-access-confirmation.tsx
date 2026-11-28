"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function StudentAccessConfirmation({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function continueToPortal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/student/access/" + encodeURIComponent(token), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to verify this access link.");
      router.replace("/student/results");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return <div style={{ display: "grid", width: "100%", gap: 10 }}>
    <button className="button button-primary button-full" type="button" onClick={continueToPortal} disabled={busy}>
      {busy ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={16}/>}
      {busy ? "Verifying link…" : "Continue to my results"}
    </button>
    {error ? <p role="alert" style={{ margin: 0, color: "#b42318", fontSize: 12 }}>{error}</p> : null}
  </div>;
}
