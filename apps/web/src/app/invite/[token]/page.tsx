import Link from "next/link";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Invitation, Institution, User } from "@/models";
import { acceptTeamInvitation } from "@/app/actions/team";

type Props={params:Promise<{token:string}>};
type InvitationRecord={email:string;institutionId:unknown;role:string};
type InstitutionRecord={name:string};
export default async function InvitePage({params}:Props){
 const {token}=await params;const session=await auth();
 if(!session?.user?.id||!session.user.email)return <main className="invite-page"><h1>Team invitation</h1><p>Sign in with the email address that received this invitation.</p><Link className="button button-primary" href="/login">Sign in</Link></main>;
 if(!/^[A-Za-z0-9_-]{40,50}$/.test(token))return <main className="invite-page"><h1>Invalid invitation</h1><p>This invitation link is not valid.</p></main>;
 await connectToDatabase();
 const tokenHash=createHash("sha256").update(token).digest("hex");
 const invitation=await Invitation.findOne({tokenHash,acceptedAt:null,expiresAt:{$gt:new Date()}}).lean() as unknown as InvitationRecord|null;
 if(!invitation)return <main className="invite-page"><h1>Invitation expired</h1><p>Ask the institution administrator to create a new invitation.</p></main>;
 if(invitation.email.toLowerCase()!==session.user.email.toLowerCase())return <main className="invite-page"><h1>Wrong account</h1><p>This invitation was issued to {invitation.email}. Sign in using that email address before accepting.</p><Link className="button button-secondary" href="/login">Continue to sign in</Link></main>;
 const account=await User.findById(session.user.id).select("emailVerified").lean() as unknown as {emailVerified?:Date|null}|null;
 if(!account?.emailVerified)return <main className="invite-page"><h1>Verify your email first</h1><p>To protect institution access, invitations can only be accepted by accounts with a verified email address. Sign in with Google using the invited email, or complete email verification.</p><Link className="button button-secondary" href="/login">Back to sign in</Link></main>;
 const institution=await Institution.findById(invitation.institutionId).select("name").lean() as unknown as InstitutionRecord|null;
 if(!institution)return <main className="invite-page"><h1>Institution unavailable</h1><p>This institution no longer exists.</p></main>;
 return <main className="invite-page"><span className="brand-mark">OMR</span><p className="eyebrow">TEAM INVITATION</p><h1>Join {institution.name}</h1><p>You have been invited as <strong>{invitation.role}</strong>.</p><form action={acceptTeamInvitation}><input type="hidden" name="token" value={token}/><button className="button button-primary" type="submit">Accept invitation</button></form></main>;
}
