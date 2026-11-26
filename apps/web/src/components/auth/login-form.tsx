"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const result = await signIn("credentials", { email, password, redirect: false, redirectTo: "/dashboard" });
    if (result?.error) { setError("Email or password is incorrect."); setLoading(false); return; }
    window.location.assign("/dashboard");
  }
  async function googleSignIn() { setLoading(true); await signIn("google", { redirectTo: "/dashboard" }); }
  return <div className="auth-form-wrap">
    {searchParams.get("registered") ? <p className="form-alert success" role="status">Account created. Sign in with your email and password.</p> : null}
    {searchParams.get("error") ? <p className="form-alert error" role="alert">We could not complete that request. Please try again.</p> : null}
    {googleEnabled ? <button className="button button-secondary button-full" onClick={googleSignIn} disabled={loading} type="button">Continue with Google <ArrowRight size={16} /></button> : null}
    {googleEnabled ? <div className="auth-divider"><span>or continue with email</span></div> : null}
    <form onSubmit={submit} className="stack-form">
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" placeholder="you@institution.edu" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} />
      <button className="button button-primary button-full" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />} Sign in securely</button>
    </form>
    {error ? <p className="form-alert error" role="alert">{error}</p> : null}
    <p className="auth-footnote">New to OMR Checker? <Link href="/register">Create an account</Link>.</p>
  </div>;
}
