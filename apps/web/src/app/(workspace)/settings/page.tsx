import Link from "next/link";
import mongoose from "mongoose";
import { AlertCircle, Building2, CheckCircle2, Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Institution, Membership } from "@/models";
import { updateInstitutionProfile } from "@/app/actions/institution-management";

type Props = { searchParams: Promise<{ institutionId?: string; error?: string; saved?: string }> };
const errors: Record<string,string> = { invalid_profile:"Please check the institution details.", forbidden:"Only institution administrators can edit these settings.", slug_taken:"That workspace URL is already taken.", save_failed:"Could not save institution settings." };
export default async function SettingsPage({searchParams}:Props) {
  const params=await searchParams; const session=await auth();
  if(!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  await connectToDatabase();
  const memberships=await Membership.find({userId:new mongoose.Types.ObjectId(session.user.id)}).select("institutionId").lean();
  const institutions=await Institution.find({_id:{$in:memberships.map(m=>m.institutionId)}}).select("name").lean();
  const current=await getCurrentInstitution(session.user.id,params.institutionId);
  if(!current) return <section className="management-page"><h1>Institution settings</h1><p>Create an institution to configure its profile.</p><Link className="button button-primary" href="/dashboard">Go to dashboard</Link></section>;
  const canManage=["owner","admin"].includes(String(current.role));
  const institution=current.institution;
  return <div className="management-page">
    <div className="page-topline"><span className="eyebrow">WORKSPACE PREFERENCES</span><span className="secure-chip"><Settings2 size={14}/> Institution settings</span></div>
    <section className="management-intro"><p className="muted-copy">Manage your organization</p><h1>Settings</h1><p>Update the public profile and workspace identity for your institution.</p></section>
    <div className="institution-switcher">{institutions.map((item)=><Link key={String(item._id)} className={String(item._id)===current.institutionId?"switcher-link active":"switcher-link"} href={`/settings?institutionId=${item._id}`}>{item.name}</Link>)}</div>
    {params.saved?<div className="form-alert success"><CheckCircle2 size={16}/> Institution settings saved.</div>:null}
    {params.error&&errors[params.error]?<div className="form-alert error"><AlertCircle size={16}/>{errors[params.error]}</div>:null}
    <section className="management-panel settings-panel">
      <div className="management-panel-heading"><div><h2>Institution profile</h2><p>These details belong to this institution, not your personal account.</p></div><Building2 size={20}/></div>
      <form action={updateInstitutionProfile} className="management-form"><input type="hidden" name="institutionId" value={current.institutionId}/>
        <label>Institution name<input name="name" defaultValue={institution.name} required minLength={2} maxLength={100} disabled={!canManage}/></label>
        <label>Workspace URL slug<input name="slug" defaultValue={institution.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={48} disabled={!canManage}/></label>
        <div className="form-two-columns"><label>Contact email<input name="email" type="email" defaultValue={institution.email??""} maxLength={254} disabled={!canManage}/></label><label>Phone number<input name="phone" defaultValue={institution.phone??""} maxLength={30} disabled={!canManage}/></label></div>
        <label>Website<input name="website" type="url" defaultValue={institution.website??""} placeholder="https://example.edu" disabled={!canManage}/></label>
        <label>Address<textarea name="address" rows={3} defaultValue={institution.address??""} maxLength={300} disabled={!canManage}/></label>
        {canManage?<button className="button button-primary" type="submit">Save institution profile</button>:<p className="helper-copy">You have read-only access to institution settings.</p>}
      </form>
    </section>
  </div>;
}
