"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountError,
  changeCustomerEmail,
  authenticateCustomer,
  createCustomerSession,
  destroyCustomerSession,
  getCustomerSession,
  registerCustomer,
} from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";

export type AuthState = { error?: string; ok?: string } | undefined;

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await ensureSeeded();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const age = String(formData.get("age") ?? "");
  const country = String(formData.get("country") ?? "");
  const city = String(formData.get("city") ?? "");
  try {
    const customer = await registerCustomer(name, email, password, age, country, city);
    await createCustomerSession(customer);
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    console.error("[account/register]", err);
    return { error: "Could not create the account. Please try again." };
  }
  redirect("/account");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await ensureSeeded();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const customer = await authenticateCustomer(email, password);
  if (!customer) return { error: "Incorrect email or password." };
  await createCustomerSession(customer);
  redirect("/account");
}

/**
 * Moves a signed-in account to a new email address. The current password is
 * required so a borrowed phone cannot redirect someone's purchases, and the
 * session cookie is re-issued with the new address straight away.
 */
export async function changeEmailAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await ensureSeeded();
  const session = await getCustomerSession();
  if (!session) return { error: "Your session has expired — please sign in again." };
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email.trim()) return { error: "Enter the new email address you want to use." };
  try {
    const updated = await changeCustomerEmail(session.id, email, password);
    await createCustomerSession(updated);
    revalidatePath("/account");
    return { ok: `Done — your account now uses ${updated.email}. Receipts, download links and license certificates will go there.` };
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    console.error("[account/change-email]", err);
    return { error: "Could not change your email. Please try again." };
  }
}

export async function logoutAction() {
  await destroyCustomerSession();
  redirect("/");
}
