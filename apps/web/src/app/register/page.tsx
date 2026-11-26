import Link from "next/link";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { registerUser } from "@/app/actions/auth";

const messages: Record<string, string> = {
  invalid_input: "Enter a valid name, email, and password (at least 8 characters).",
  email_exists: "An account with this email already exists. Please sign in.",
  registration_failed: "We could not create your account. Please try again.",
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <div className="brand-lockup"><span className="brand-mark"><GraduationCap size={22} /></span><span>OMR Checker</span></div>
      <div className="auth-brand-copy"><p className="eyebrow">START YOUR WORKSPACE</p><h1>Make every assessment count.</h1><p>Create an account, set up your institution, and bring your examination workflow together.</p></div>
      <div className="secure-note"><ShieldCheck size={17} /> Secure MongoDB-backed account</div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <p className="eyebrow">GET STARTED</p><h2>Create your account</h2><p className="muted-copy">You can create your institution workspace after signing in.</p>
      {params.error && messages[params.error] ? <p className="form-alert error" role="alert">{messages[params.error]}</p> : null}
      <form action={registerUser} className="stack-form">
        <label htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} />
        <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
        <button className="button button-primary button-full" type="submit">Create account</button>
      </form>
      <p className="auth-footnote">Already registered? <Link href="/login">Sign in</Link>.</p>
    </div></section>
  </main>;
}
