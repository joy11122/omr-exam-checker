import Link from "next/link";
import mongoose from "mongoose";
import { AlertCircle, CheckCircle2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Institution, Membership, User, Invitation } from "@/models";
import { createTeamInvitation, removeTeamMember, updateMemberRole } from "@/app/actions/team";
import { InviteLinkCopy } from "@/components/workspace/invite-link-copy";

type Props={searchParams:Promise<{institutionId?:string;error?:string;invite?:string;updated?:string;removed?:string;joined?:string}>};
const errors:Record<string,string>={invalid_invitation:"Enter a valid email and role.",forbidden:"You do not have permission to manage this team.",already_member:"This user is already a member.",invite_failed:"Could not create the invitation.",plan_limit_reached:"Your plan team-member limit has been reached. Upgrade the plan to invite more people.",invalid_role:"Choose a valid team role.",protected_owner:"The institution owner cannot be changed or removed.",role_update_failed:"Could not update the member role.",invalid_member:"Invalid team member.",remove_failed:"Could not remove this member."};
export default async function TeamPage({searchParams}:Props){
 const params=await searchParams;const session=await auth();
 if(!session?.user?.id||!mongoose.isValidObjectId(session.user.id))return null;
 await connectToDatabase();
 const memberships=await Membership.find({userId:new mongoose.Types.ObjectId(session.user.id)}).select("institutionId").lean();
 const institutions=await Institution.find({_id:{$in:memberships.map(m=>m.institutionId)}}).select("name").lean();
 const current=await getCurrentInstitution(session.user.id,params.institutionId);
 if(!current)return <section className="management-page"><h1>Team</h1><p>Create an institution before inviting your team.</p><Link className="button button-primary" href="/dashboard">Go to dashboard</Link></section>;
 const members=await Membership.find({institutionId:new mongoose.Types.ObjectId(current.institutionId)}).populate({path:"userId",model:User,select:"name email"}).sort({createdAt:1}).lean();
 const pending=await Invitation.find({institutionId:new mongoose.Types.ObjectId(current.institutionId),acceptedAt:null,expiresAt:{$gt:new Date()}}).select("email role expiresAt").sort({createdAt:-1}).limit(20).lean();
 const canInvite=["owner","admin"].includes(String(current.role));const isOwner=current.role==="owner";
 const appUrl=(process.env.NEXT_PUBLIC_APP_URL??process.env.AUTH_URL??"").replace(/\/$/,"");
 return <div className="management-page">
  <div className="page-topline"><span className="eyebrow">ACCESS MANAGEMENT</span><span className="secure-chip"><ShieldCheck size={14}/> Tenant protected</span></div>
  <section className="management-intro"><p className="muted-copy">People and permissions</p><h1>Team</h1><p>Invite colleagues and control who can manage examinations for this institution.</p></section>
  <div className="institution-switcher">{institutions.map(item=><Link key={String(item._id)} className={String(item._id)===current.institutionId?"switcher-link active":"switcher-link"} href={`/team?institutionId=${item._id}`}>{item.name}</Link>)}</div>
  {params.invite?<div className="invite-link-panel"><div><strong>Invitation link created</strong><p>Share this one-time link with the invited person. It expires in 7 days.</p><InviteLinkCopy url={`${appUrl}/invite/${params.invite}`}/>{!appUrl?<small>Set NEXT_PUBLIC_APP_URL in the deployment environment to generate a full shareable URL.</small>:null}</div></div>:null}
  {params.updated||params.removed||params.joined?<div className="form-alert success"><CheckCircle2 size={16}/> Team changes saved.</div>:null}
  {params.error&&errors[params.error]?<div className="form-alert error"><AlertCircle size={16}/>{errors[params.error]}</div>:null}
  <section className="management-panel"><div className="management-panel-heading"><div><h2>Members</h2><p>{members.length} people with access to this workspace.</p></div><span className="count-pill">{members.length}</span></div>
   <div className="team-list">{members.map((member)=>{const user=member.userId as unknown as {name?:string;email?:string;_id?:mongoose.Types.ObjectId};return <article className="team-row" key={String(member._id)}>
    <span className="avatar-circle">{(user?.name??user?.email??"U").slice(0,1).toUpperCase()}</span><div className="team-person"><strong>{user?.name??"Team member"}</strong><small>{user?.email??""}</small></div>
    {isOwner&&member.role!=="owner"?<><form action={updateMemberRole} className="role-form"><input type="hidden" name="institutionId" value={current.institutionId}/><input type="hidden" name="membershipId" value={String(member._id)}/><select name="role" defaultValue={member.role}><option value="admin">Admin</option><option value="teacher">Teacher</option><option value="examiner">Examiner</option></select><button className="button button-secondary" type="submit">Update</button></form><form action={removeTeamMember}><input type="hidden" name="institutionId" value={current.institutionId}/><input type="hidden" name="membershipId" value={String(member._id)}/><button className="icon-danger-button" type="submit" aria-label="Remove team member">×</button></form></>:<span className="role-pill">{member.role}</span>}
   </article>})}</div>
  </section>
  {canInvite?<section className="management-grid">
   <div className="management-panel"><div className="management-panel-heading"><div><h2>Invite a teammate</h2><p>Create a secure invitation link for a colleague.</p></div><UserPlus size={19}/></div>
    <form action={createTeamInvitation} className="management-form"><input type="hidden" name="institutionId" value={current.institutionId}/><label>Email address<input name="email" type="email" required maxLength={254} placeholder="colleague@example.com"/></label><label>Role<select name="role" defaultValue="teacher"><option value="teacher">Teacher — manage students and exams</option><option value="examiner">Examiner — assist with exam checking</option>{isOwner?<option value="admin">Admin — manage institution workspace</option>:null}</select></label><button className="button button-primary" type="submit">Create invite link <Mail size={15}/></button></form>
   </div>
   <div className="management-panel"><div className="management-panel-heading"><div><h2>Pending invitations</h2><p>Invitations expire after seven days.</p></div><Mail size={19}/></div>
    {pending.length?<div className="pending-list">{pending.map(invite=><div className="pending-row" key={String(invite._id)}><div><strong>{invite.email}</strong><small>{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</small></div><span className="pending-pill">Pending</span></div>)}</div>:<p className="helper-copy">No pending invitations.</p>}
   </div>
  </section>:null}
  <p className="helper-copy">Invitation links are generated securely but are not emailed automatically in this phase. Share the link directly with the intended colleague.</p>
 </div>;
}
