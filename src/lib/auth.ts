import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";

const COOKIE_NAME = "mb_admin_session";
const SESSION_DAYS = 7;

export type AdminSession = { id: number; email: string; name: string };

function secretKey(): Uint8Array {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return new TextEncoder().encode(raw);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createAdminSession(admin: AdminSession) {
  const token = await new SignJWT({ email: admin.email, name: admin.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(admin.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: parseInt(payload.sub, 10),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? "Admin"),
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireAdminApi(): Promise<AdminSession | null> {
  return getAdminSession();
}

export async function authenticateAdmin(email: string, password: string): Promise<AdminSession | null> {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email.trim().toLowerCase()))
    .limit(1);
  if (!admin) return null;
  if (!verifyPassword(password, admin.passwordHash)) return null;
  return { id: admin.id, email: admin.email, name: admin.name };
}

export async function changeAdminPassword(adminId: number, newPassword: string) {
  await db.update(admins).set({ passwordHash: hashPassword(newPassword) }).where(eq(admins.id, adminId));
}
