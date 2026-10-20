import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, orders } from "@/db/schema";
import { hashPassword, verifyPassword } from "./auth";
import { EMAIL_ERROR, isValidEmail, normalizeEmailAddress } from "./email-address";

/**
 * Artist/customer accounts.
 *
 * Sessions are JWTs in their own cookie, with a `role: "customer"` claim that
 * the admin session deliberately does not carry — so a token minted for one
 * kind of account can never be replayed as the other.
 */

const COOKIE_NAME = "mb_customer_session";
const SESSION_DAYS = 30;

export type CustomerSession = {
  id: number;
  email: string;
  name: string;
  age?: number | null;
  country?: string | null;
  city?: string | null;
  studentId?: string | null;
  createdAt?: Date | null;
};

export class AccountError extends Error {}

function secretKey(): Uint8Array {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return new TextEncoder().encode(raw);
}

export function normalizeEmail(email: string): string {
  return normalizeEmailAddress(email);
}

export function generateStudentIdFromId(id: number): string {
  const year = new Date().getFullYear();
  return `MBZ-${year}-${String(id).padStart(5, "0")}`;
}

function generateRandomStudentId(): string {
  const year = new Date().getFullYear();
  const rand = randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  return `MBZ-${year}-${rand}`;
}

export async function ensureStudentId(customerId: number, existingStudentId?: string | null): Promise<string | null> {
  if (existingStudentId) return existingStudentId;
  // fetch and generate if missing
  const [customer] = await db.select({ id: customers.id, studentId: customers.studentId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;
  if (customer.studentId) return customer.studentId;
  const newId = generateStudentIdFromId(customer.id);
  try {
    const [updated] = await db.update(customers).set({ studentId: newId }).where(eq(customers.id, customerId)).returning({ studentId: customers.studentId });
    return updated?.studentId ?? newId;
  } catch {
    // fallback to random if collision (should not happen with id-based)
    const randId = generateRandomStudentId();
    const [updated] = await db.update(customers).set({ studentId: randId }).where(eq(customers.id, customerId)).returning({ studentId: customers.studentId });
    return updated?.studentId ?? randId;
  }
}

export async function createCustomerSession(customer: CustomerSession) {
  const token = await new SignJWT({
    email: customer.email,
    name: customer.name,
    age: customer.age ?? null,
    country: customer.country ?? null,
    city: customer.city ?? null,
    studentId: customer.studentId ?? null,
    createdAt: customer.createdAt ? customer.createdAt.toISOString() : null,
    role: "customer",
  })
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
    const p = payload as Record<string, unknown>;
    const rawAge = p.age;
    const age = rawAge == null || rawAge === "" ? null : Number(rawAge);
    const rawCreatedAt = p.createdAt ? String(p.createdAt) : null;
    return {
      id: parseInt(payload.sub, 10),
      email: String(p.email ?? "").toLowerCase(),
      name: String(p.name ?? ""),
      age: Number.isFinite(age) ? age : null,
      country: p.country ? String(p.country) : null,
      city: p.city ? String(p.city) : null,
      studentId: p.studentId ? String(p.studentId) : null,
      createdAt: rawCreatedAt ? new Date(rawCreatedAt) : null,
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

function validateCredentials(
  name: string,
  email: string,
  password: string,
  ageRaw: string | number | null | undefined,
  country: string | null | undefined,
  city: string | null | undefined,
) {
  if (name.trim().length < 2) throw new AccountError("Please enter your name.");
  if (!isValidEmail(email)) throw new AccountError(EMAIL_ERROR);
  if (password.length < 8) throw new AccountError("Your password must be at least 8 characters.");
  if (ageRaw == null || String(ageRaw).trim() === "") throw new AccountError("Please enter your age.");
  const age = typeof ageRaw === "number" ? ageRaw : Number(String(ageRaw).trim());
  if (!Number.isFinite(age) || !Number.isInteger(age)) throw new AccountError("Please enter a valid age.");
  if (age < 1 || age > 120) throw new AccountError("Age must be between 1 and 120.");
  if (!country || !country.trim()) throw new AccountError("Please enter your country.");
  if (country.trim().length < 2) throw new AccountError("Please enter a valid country.");
  if (!city || !city.trim()) throw new AccountError("Please enter your city.");
  if (city.trim().length < 2) throw new AccountError("Please enter a valid city.");
}

export async function registerCustomer(
  name: string,
  email: string,
  password: string,
  ageRaw: string | number | null | undefined,
  countryRaw?: string | null | undefined,
  cityRaw?: string | null | undefined,
): Promise<CustomerSession> {
  const normalized = normalizeEmail(email);
  const country = countryRaw?.trim() ?? "";
  const city = cityRaw?.trim() ?? "";
  validateCredentials(name, normalized, password, ageRaw, country, city);
  const age = typeof ageRaw === "number" ? ageRaw : Number(String(ageRaw).trim());
  const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, normalized)).limit(1);
  if (existing) throw new AccountError("An account with this email already exists — sign in instead.");
  const [customer] = await db
    .insert(customers)
    .values({
      name: name.trim(),
      email: normalized,
      passwordHash: hashPassword(password),
      age,
      country: country.trim(),
      city: city.trim(),
    })
    .returning();
  // Generate student ID from DB id
  const studentId = generateStudentIdFromId(customer.id);
  let finalCustomer = customer;
  try {
    const [updated] = await db.update(customers).set({ studentId }).where(eq(customers.id, customer.id)).returning();
    if (updated) finalCustomer = updated;
  } catch {
    // ignore if collision, keep random fallback
    const rnd = generateRandomStudentId();
    const [updated] = await db.update(customers).set({ studentId: rnd }).where(eq(customers.id, customer.id)).returning();
    if (updated) finalCustomer = updated;
  }
  await linkCustomerPurchases(finalCustomer.id, normalized);
  return {
    id: finalCustomer.id,
    email: finalCustomer.email,
    name: finalCustomer.name,
    age: finalCustomer.age,
    country: finalCustomer.country,
    city: finalCustomer.city,
    studentId: finalCustomer.studentId,
    createdAt: finalCustomer.createdAt ?? null,
  };
}

export async function authenticateCustomer(email: string, password: string): Promise<CustomerSession | null> {
  const normalized = normalizeEmail(email);
  const [customer] = await db.select().from(customers).where(eq(customers.email, normalized)).limit(1);
  if (!customer || !verifyPassword(password, customer.passwordHash)) return null;
  await linkCustomerPurchases(customer.id, customer.email);
  // Ensure student ID exists for older accounts
  if (!customer.studentId) {
    const sid = await ensureStudentId(customer.id, customer.studentId);
    customer.studentId = sid;
  }
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    age: customer.age ?? null,
    country: customer.country ?? null,
    city: customer.city ?? null,
    studentId: customer.studentId ?? null,
    createdAt: customer.createdAt ?? null,
  };
}

export async function getCustomerById(id: number): Promise<CustomerSession | null> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return null;
  if (!customer.studentId) {
    const sid = await ensureStudentId(customer.id, customer.studentId);
    customer.studentId = sid;
  }
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    age: customer.age ?? null,
    country: customer.country ?? null,
    city: customer.city ?? null,
    studentId: customer.studentId ?? null,
    createdAt: customer.createdAt ?? null,
  };
}

/**
 * Moves an account onto a new email address. Artists change address (a new
 * artist name, a label inbox, a typo when they signed up), so they can do it
 * themselves from Your account.
 *
 * The current password is required — otherwise anyone who borrowed a phone
 * could point the account (and its licence certificates) at their own inbox.
 * Purchases already sitting on the old address stay linked to the account, and
 * anything bought with the new address joins it the moment it changes.
 */
export async function changeCustomerEmail(
  customerId: number,
  nextEmail: string,
  password: string,
): Promise<CustomerSession> {
  const email = normalizeEmail(nextEmail);
  if (!isValidEmail(email)) throw new AccountError(EMAIL_ERROR);
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new AccountError("We could not find your account — please sign in again.");
  if (!verifyPassword(password, customer.passwordHash)) {
    throw new AccountError("That password is not right. Enter your current password to change your email.");
  }
  if (email === customer.email) {
    throw new AccountError("That is already the email on your account — enter a different one to change it.");
  }
  const [taken] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
  if (taken) throw new AccountError("Another account already uses that email — sign in with it instead.");

  await db.update(customers).set({ email }).where(eq(customers.id, customerId));
  // Orders and bookings bought with the new address but not yet attached to an
  // account now follow it, exactly as they would on sign-in.
  await linkCustomerPurchases(customerId, email);
  if (!customer.studentId) {
    const sid = await ensureStudentId(customer.id, customer.studentId);
    customer.studentId = sid;
  }
  return {
    id: customer.id,
    email,
    name: customer.name,
    age: customer.age ?? null,
    country: customer.country ?? null,
    city: customer.city ?? null,
    studentId: customer.studentId ?? null,
    createdAt: customer.createdAt ?? null,
  };
}
