// The /admin sign-in: one password (ADMIN_PASSWORD) and a signed, httpOnly
// cookie. Without both ADMIN_PASSWORD and ADMIN_SESSION_SECRET, /admin says it
// isn't set up instead of letting anyone in.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "copper_admin";

export function adminConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET,
  );
}

function sign(value: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? "")
    .update(value)
    .digest("hex");
}

/** The cookie value that proves a correct password was entered. */
export function sessionToken(): string {
  return sign("admin");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(password: string): boolean {
  if (!adminConfigured()) return false;
  // Compare hashes so the length of the real password isn't revealed.
  return same(sign(password), sign(process.env.ADMIN_PASSWORD ?? ""));
}

/** True when this request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  return same(value, sessionToken());
}
