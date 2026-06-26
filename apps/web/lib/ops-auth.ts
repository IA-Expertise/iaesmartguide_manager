import { createHmac, timingSafeEqual } from "crypto";

export const OPS_COOKIE_NAME = "ops_session";
const OPS_COOKIE_SALT = "iaesmartguide-ops-v1";

export function opsCookieValue(password: string): string {
  return createHmac("sha256", password).update(OPS_COOKIE_SALT).digest("hex");
}

export function verifyOpsCookie(cookie: string | undefined): boolean {
  const password = process.env.OPS_PASSWORD;
  if (!password || !cookie) return false;

  const expected = opsCookieValue(password);
  try {
    const a = Buffer.from(cookie);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
