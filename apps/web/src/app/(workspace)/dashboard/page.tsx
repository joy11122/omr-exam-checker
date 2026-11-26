import { AlertCircle, ArrowUpRight, Building2, CheckCircle2, FileSearch, Plus } from "lucide-react";
import { createInstitution } from "@/app/actions/institutions";
import { createClient } from "@/lib/supabase/server";

type DashboardPageProps = {
  searchParams: Promise<{ error?: string; created?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_institution: "Please enter a valid institution name and URL slug.",
  slug_taken: "That institution URL is already in use. Choose another slug.",
  institution_create_failed: "We could not create the institution. Please try again.",
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: institutions } = await supabase
    .from("institutions")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="dashboard-page">
      <div className="page-topline"><span className="eyebrow">INSTITUTION WORKSPACE</span><span className="secure-chip"><CheckCircle2 size={14} /> Secure session</span></div>
      <section className="dashboard-intro">
        <p className="muted-copy">Your examination operations, in one place.</p>
        <h1>Good to have you here.</h1>
        <p className="intro-description">Create your institution workspace to start organizing exams, answer keys, OMR scans, and student results.</p>
      </section>

      {params.created ? <div className="form-alert success"><CheckCircle2 size={17} /> Institution workspace created successfully.</div> : null}
      {params.error && errorMessages[params.error] ? <div className="form-alert error"><AlertCircle size={17} /> {errorMessages[params.error]}</div> : null}

      <section className="metric-grid" aria-label="Workspace summary">
        <article className="metric-card"><span className="metric-icon"><Building2 size={19} /></span><span className="metric-label">Institutions</span><strong>{institutions?.length ?? 0}</strong><small>Connected workspaces</small></article>
        <article className="metric-card"><span className="metric-icon"><FileSearch size={19} /></span><span className="metric-label">OMR scans</span><strong>—</strong><small>Available in a later phase</small></article>
        <article className="metric-card"><span className="metric-icon"><CheckCircle2 size={19} /></span><span className="metric-label">Processing status</span><strong>Ready</strong><small>Foundation services online</small></article>
      </section>

      <section className="content-section" id="new-institution">
        <div className="section-heading"><div><h2>Your institutions</h2><p>Each institution has its own isolated workspace and team.</p></div><span className="count-pill">{institutions?.length ?? 0}</span></div>
        {institutions?.length ? (
          <div className="institution-list">
            {institutions.map((institution) => (
              <article className="institution-row" key={institution.id}>
                <span className="institution-icon"><Building2 size={20} /></span>
                <div className="institution-details"><strong>{institution.name}</strong><span>omrchecker.app/{institution.slug}</span></div>
                <span className="role-pill">Workspace</span>
                <ArrowUpRight size={18} className="muted-icon" />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon"><Building2 size={23} /></span><strong>No institution workspace yet</strong><p>Create your first workspace to begin setting up exams.</p></div>
        )}
      </section>

      <section className="content-section create-card">
        <div className="create-card-heading"><span className="create-card-icon"><Plus size={19} /></span><div><h2>Create an institution</h2><p>Set up a dedicated workspace for a school, college, or coaching center.</p></div></div>
        <form action={createInstitution} className="institution-form">
          <div className="form-field"><label htmlFor="institution-name">Institution name</label><input id="institution-name" name="name" placeholder="e.g. Sunrise College" minLength={2} maxLength={100} required /></div>
          <div className="form-field"><label htmlFor="institution-slug">Workspace URL slug</label><div className="slug-input"><span>omrchecker.app/</span><input id="institution-slug" name="slug" placeholder="sunrise-college" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={48} required /></div></div>
          <button className="button button-primary" type="submit">Create workspace <ArrowUpRight size={16} /></button>
        </form>
      </section>
    </div>
  );
}
