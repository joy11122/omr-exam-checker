"use client";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle } from "lucide-react";

type Plan = "free" | "growth" | "enterprise";
export function PlanRequestForm({ institutionId, currentPlan }: { institutionId: string; currentPlan: Plan }) {
  const [plan, setPlan] = useState<Plan>(currentPlan);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institutionId, plan }) });
      const payload = await response.json();
      setMessage(response.ok ? payload.message : payload.error ?? "Unable to submit request.");
    } catch { setMessage("Network error. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="billing-request-form" onSubmit={submit}>
    <label htmlFor="billing-plan">Request a plan change</label>
    <select id="billing-plan" value={plan} onChange={(event) => setPlan(event.target.value as Plan)}>
      <option value="free">Free</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option>
    </select>
    <button className="button button-primary" type="submit" disabled={busy || plan === currentPlan}>{busy ? <LoaderCircle size={16} className="spin"/> : <ArrowUpRight size={16}/>} Submit request</button>
    {message ? <p className="billing-request-message" role="status"><CheckCircle2 size={15}/>{message}</p> : null}
  </form>;
}
