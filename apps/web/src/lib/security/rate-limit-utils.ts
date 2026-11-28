import { isIP } from "node:net";

export function getClientAddress(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  return "unknown";
}

export function isRateLimitAllowed(count: number, limit: number): boolean {
  return Number.isSafeInteger(count) && Number.isSafeInteger(limit) && count >= 1 && limit >= 1 && count <= limit;
}
