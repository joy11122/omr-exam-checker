import "server-only";

import { OAuth2Client } from "google-auth-library";
import { normalizeVerifiedGoogleIdentity } from "@/lib/auth/google-identity-utils";

const verifier = new OAuth2Client();

export async function verifyNativeGoogleIdToken(idToken: string, audience: string) {
  if (!audience || idToken.length < 100 || idToken.length > 8192) return null;
  try {
    const ticket = await verifier.verifyIdToken({ idToken, audience });
    return normalizeVerifiedGoogleIdentity(ticket.getPayload());
  } catch {
    return null;
  }
}
