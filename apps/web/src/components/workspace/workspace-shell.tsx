"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { BookOpenCheck, ChevronDown, ClipboardList, FileSearch, GraduationCap, LayoutDashboard, LogOut, Menu, Plus, Settings2, ShieldCheck, Users } from "lucide-react";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Exams", href: "/exams", icon: ClipboardList },
  { label: "OMR scans", href: "/scans", icon: FileSearch },
  { label: "Results", href: "/results", icon: BookOpenCheck },
  { label: "Students", href: "/students", icon: Users },
];

export function WorkspaceShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  async function handleSignOut() { setSigningOut(true); await signOut({ callbackUrl: "/login" }); }
  return <div className="workspace-shell">
    {mobileOpen ? <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
    <aside className={`workspace-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <Link href="/dashboard" className="sidebar-brand" onClick={() => setMobileOpen(false)}><span className="brand-mark"><GraduationCap size={21} /></span><span>OMR Checker</span></Link>
      <button className="new-workspace-button" onClick={() => router.push("/dashboard#new-institution")}><Plus size={17} /> New institution</button>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`sidebar-link ${active ? "active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="sidebar-spacer" />
      <Link href="/settings" className="sidebar-link"><Settings2 size={18} /><span>Settings</span></Link>
      <div className="sidebar-account"><span className="avatar-circle">{email.slice(0, 1).toUpperCase()}</span><span className="account-copy"><strong>{email.split("@")[0]}</strong><small>{email}</small></span><ChevronDown size={16} /></div>
      <button className="sidebar-signout" onClick={handleSignOut} disabled={signingOut}><LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}</button>
      <div className="sidebar-security"><ShieldCheck size={15} /> Secure institution workspace</div>
    </aside>
    <main className="workspace-main"><header className="mobile-topbar">
      <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
      <Link href="/dashboard" className="mobile-brand"><GraduationCap size={19} /> OMR Checker</Link>
      <span className="avatar-circle small">{email.slice(0, 1).toUpperCase()}</span>
    </header><div className="workspace-content">{children}</div></main>
  </div>;
}
