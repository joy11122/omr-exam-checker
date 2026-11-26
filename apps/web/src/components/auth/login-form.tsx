"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const callbackError = searchParams.get("error");

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (authError) setError(authError.message);
    else setMessage("Check your email for a secure sign-in link.");

    setLoading(false);
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-wrap">
      {callbackError ? <p className="form-alert error">Sign-in could not be completed. Please try again.</p> : null}
      <button className="button button-secondary button-full" onClick={signInWithGoogle} disabled={loading} type="button">
        Continue with Google
        <ArrowRight size={16} />
      </button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <form onSubmit={sendMagicLink} className="stack-form">
        <label htmlFor="email">Work or institution email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@institution.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className="button button-primary button-full" type="submit" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <Mail size={17} />}
          Send secure sign-in link
        </button>
      </form>
      {message ? <p className="form-alert success" role="status">{message}</p> : null}
      {error ? <p className="form-alert error" role="alert">{error}</p> : null}
      <p className="auth-footnote">By continuing, you agree to use this workspace only for authorized educational activities.</p>
    </div>
  );
}
