import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, orders } from "@/db/schema";
import { hashPassword, verifyPassword } from "./auth";

/**
 * Artist/customer accounts.
 *
 * Sessions are JWTs in their own cookie, with a `role: "customer"` claim that
 * the admin session deliberately does not carry — so a token minted for one
 * kind of account can never be replayed as the other.
 */

const COOKIE_NAME = "mb_customer_session";
const SESSION_DAYS = 30;

export type CustomerSession = { id: number; email: string; name: string };

export class AccountError extends Error {}

function secretKey(): Uint8Array {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return new TextEncoder().encode(raw);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createCustomerSession(customer: CustomerSession) {
  const token = await new SignJWT({ email: customer.email, name: customer.name, role: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(customer.id))
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

export async function destroyCustomerSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || payload.role !== "customer") return null;
    return {
      id: parseInt(payload.sub, 10),
      email: String(payload.email ?? "").toLowerCase(),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Attaches every order and booking made with this email to the account.
 * Runs on sign-in and on sign-up, so purchases made before the account
 * existed still show up on the account page.
 */
export async function linkCustomerPurchases(customerId: number, email: string) {
  const normalized = normalizeEmail(email);
  await db
    .update(orders)
    .set({ customerId })
    .where(sql`lower(${orders.customerEmail}) = ${normalized} AND ${orders.customerId} IS NULL`);
}

function validateCredentials(name: string, email: string, password: string) {
  if (name.trim().length < 2) throw new AccountError("Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Please enter a valid email address.");
  if (password.length < 8) throw new AccountError("Your password must be at least 8 characters.");
}

export async function registerCustomer(name: string, email: string, password: string): Promise<CustomerSession> {
  const normalized = normalizeEmail(email);
  validateCredentials(name, normalized, password);
  const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, normalized)).limit(1);
  if (existing) throw new AccountError("An account with this email already exists — sign in instead.");
  const [customer] = await db
    .insert(customers)
    .values({ name: name.trim(), email: normalized, passwordHash: hashPassword(password) })
    .returning();
  await linkCustomerPurchases(customer.id, normalized);
  return { id: customer.id, email: customer.email, name: customer.name };
}

export async function authenticateCustomer(email: string, password: string): Promise<CustomerSession | null> {
  const normalized = normalizeEmail(email);
  const [customer] = await db.select().from(customers).where(eq(customers.email, normalized)).limit(1);
  if (!customer || !verifyPassword(password, customer.passwordHash)) return null;
  await linkCustomerPurchases(customer.id, customer.email);
  return { id: customer.id, email: customer.email, name: customer.name };
}

export async function getCustomerById(id: number): Promise<CustomerSession | null> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return customer ? { id: customer.id, email: customer.email, name: customer.name } : null;
}
