import { Suspense } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <div className="brand-lockup"><span className="brand-mark"><GraduationCap size={22} /></span><span>OMR Checker</span></div>
      <div className="auth-brand-copy"><p className="eyebrow">EXAM OPERATIONS, SIMPLIFIED</p><h1>Every answer sheet. Accounted for.</h1><p>One secure workspace to prepare exams, scan OMR sheets, review uncertain marks, and publish trusted results.</p></div>
      <div className="secure-note"><ShieldCheck size={17} /> Institution-level access controls</div>
    </section>
    <section className="auth-panel"><div className="auth-card"><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="muted-copy">Use your institution account to continue.</p><Suspense fallback={<div className="skeleton-line" />}><LoginForm googleEnabled={googleEnabled} /></Suspense></div></section>
  </main>;
}
