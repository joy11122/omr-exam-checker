import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { CreditCard, Users, GraduationCap, ClipboardList, ScanLine, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Institution, Membership } from "@/models";
import { getInstitutionUsage } from "@/lib/billing/usage";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { Subscription } from "@/models/subscription";
import { PlanRequestForm } from "@/components/billing/plan-request-form";
import styles from "./billing.module.css";

type Props = { searchParams: Promise<{ institutionId?: string }> };
export default async function BillingPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  await connectToDatabase();
  const current = await getCurrentInstitution(session.user.id, params.institutionId);
  if (!current) return <section className="management-page"><h1>Billing unavailable</h1><p>Create or join an institution first.</p></section>;
  if (!["owner", "admin"].includes(current.role)) return <section className="management-page"><h1>Billing access restricted</h1><p>Only institution owners and administrators can view subscription information.</p></section>;
  const [usage, memberships, subscription] = await Promise.all([
    getInstitutionUsage(current.institutionId),
    Membership.find({ userId: new mongoose.Types.ObjectId(session.user.id) }).select("institutionId").lean(),
    Subscription.findOne({ institutionId: new mongoose.Types.ObjectId(current.institutionId) }).lean() as unknown as Promise<{ paymentProvider?: string } | null>,
  ]);
  const institutions = await Institution.find({ _id: { $in: memberships.map((m) => m.institutionId) } }).select("name").lean();
  const metrics = [
    { key: "students" as const, label: "Students", value: usage.usage.students, limit: usage.limits.students, icon: GraduationCap },
    { key: "exams" as const, label: "Exams", value: usage.usage.exams, limit: usage.limits.exams, icon: ClipboardList },
    { key: "members" as const, label: "Team members", value: usage.usage.members, limit: usage.limits.members, icon: Users },
    { key: "scansPerMonth" as const, label: "Monthly scans", value: usage.usage.scansPerMonth, limit: usage.limits.scansPerMonth, icon: ScanLine },
  ];
  return <div className={"management-page " + styles.page}>
    <div className="page-topline"><span className="eyebrow">SUBSCRIPTION & USAGE</span><span className="secure-chip"><ShieldCheck size={14}/> Tenant-scoped billing</span></div>
    <section className="management-intro"><p className="muted-copy">{current.institution.name}</p><h1>Plan & billing</h1><p>Manage your institution plan, monitor capacity and request an upgrade.</p></section>
    <nav className={styles.switcher} aria-label="Choose institution">{institutions.map((item) => <a key={String(item._id)} className={String(item._id) === current.institutionId ? styles.active : ""} href={"/billing?institutionId=" + item._id}>{item.name}</a>)}</nav>
    <section className={styles.currentPlan}>
      <div><span className={styles.kicker}>CURRENT PLAN</span><h2>{PLAN_CATALOG[usage.plan].name}</h2><p>Status: {usage.status.replace("_", " ")} · Billing provider: {subscription?.paymentProvider ?? "manual"}</p></div>
      <span className={styles.planIcon}><CreditCard size={23}/></span>
    </section>
    <section className={styles.usageGrid} aria-label="Plan usage">
      {metrics.map(({key,label,value,limit,icon:Icon}) => <article key={key}><span className={styles.metricIcon}><Icon size={17}/></span><span>{label}</span><strong>{value.toLocaleString()} <small>/ {limit === null ? "Unlimited" : limit.toLocaleString()}</small></strong><div className={styles.track}><span style={{width: limit === null ? "0%" : Math.min(100, value / Math.max(1, limit) * 100) + "%"}}/></div></article>)}
    </section>
    <section className={styles.plans}>
      {Object.entries(PLAN_CATALOG).map(([id,plan]) => <article key={id} className={id === usage.plan ? styles.selected : ""}><span className={styles.kicker}>{plan.name.toUpperCase()}</span><h2>{plan.priceLabel}</h2><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><div className={styles.limits}>Students: {plan.limits.students ?? "Unlimited"} · Exams: {plan.limits.exams ?? "Unlimited"} · Team: {plan.limits.members ?? "Unlimited"}</div>{id === usage.plan ? <span className={styles.currentBadge}>Current plan</span> : null}</article>)}
    </section>
    {current.role === "owner" ? <section className={styles.requestPanel}><h2>Change your plan</h2><p>Plan requests are reviewed by the billing team. No payment is collected from this page.</p><PlanRequestForm institutionId={current.institutionId} currentPlan={usage.plan}/></section> : <p className={styles.notice}>Only the institution owner can submit plan changes.</p>}
    <p className={styles.notice}>Scan usage metering is not yet connected to the OMR intake pipeline. Monthly scan usage is shown as zero until that integration is completed. Paid-plan requests remain pending until manually confirmed; live checkout is not enabled.</p>
  </div>;
}
