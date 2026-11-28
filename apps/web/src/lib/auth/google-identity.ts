import "server-only";

import { OAuth2Client } from "google-auth-library";

export type GoogleIdentityPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export type VerifiedGoogleIdentity = {
  googleSubject: string;
  email: string;
  name: string;
  image: string | null;
};

const verifier = new OAuth2Client();

export function normalizeVerifiedGoogleIdentity(payload: GoogleIdentityPayload | undefined): VerifiedGoogleIdentity | null {
  if (!payload?.sub || !payload.email || payload.email_verified !== true) return null;
  const email = payload.email.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  return {
    googleSubject: payload.sub,
    email,
    name: (payload.name?.trim() || email.split("@")[0]).slice(0, 100),
    image: payload.picture?.startsWith("https://") ? payload.picture : null,
  };
}

export async function verifyNativeGoogleIdToken(idToken: string, audience: string) {
  if (!audience || idToken.length < 100 || idToken.length > 8192) return null;
  try {
    const ticket = await verifier.verifyIdToken({ idToken, audience });
    return normalizeVerifiedGoogleIdentity(ticket.getPayload());
  } catch {
    return null;
  }
}
