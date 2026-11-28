"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function StudentLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/student/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Try again.");
      router.replace("/student/results");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }
  return <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
    <button type="button" className="student-logout" onClick={logout} disabled={busy}><LogOut size={15}/>{busy ? "Signing out…" : "Sign out"}</button>
    {error ? <small role="alert" style={{ color: "#b42318" }}>{error}</small> : null}
  </span>;
}
