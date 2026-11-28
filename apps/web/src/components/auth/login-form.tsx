"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";

let nativeGoogleInitialization: Promise<void> | null = null;

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const result = await signIn("credentials", { email, password, redirect: false, redirectTo: "/dashboard" });
    if (result?.error) { setError("Email or password is incorrect."); setLoading(false); return; }
    router.push("/dashboard");
    router.refresh();
  }
  async function googleSignIn() {
    setLoading(true);
    setError("");
    try {
      if (Capacitor.getPlatform() === "android") {
        const webClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
        if (!webClientId) throw new Error("Native Google sign-in is not configured for this Android build.");
        nativeGoogleInitialization ??= SocialLogin.initialize({
          google: {
            webClientId,
            mode: "online",
            skipAuthOnlyAuthorizationAfterSignIn: true,
          },
        }).then(() => undefined);
        await nativeGoogleInitialization;
        const login = await SocialLogin.login({ provider: "google", options: {} });
        const idToken = (login.result as { idToken?: string }).idToken;
        if (!idToken) throw new Error("Google did not return a verified identity token.");
        const result = await signIn("native-google", { idToken, redirect: false });
        if (result?.error) throw new Error("Google sign-in could not be completed. Please try again.");
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      await signIn("google", { redirectTo: "/dashboard" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google sign-in could not be completed.");
      setLoading(false);
    }
  }
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
