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
