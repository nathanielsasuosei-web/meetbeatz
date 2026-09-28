"use server";

import { redirect } from "next/navigation";
import {
  AccountError,
  authenticateCustomer,
  createCustomerSession,
  destroyCustomerSession,
  registerCustomer,
} from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";

export type AuthState = { error?: string } | undefined;

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await ensureSeeded();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const customer = await registerCustomer(name, email, password);
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

export async function logoutAction() {
  await destroyCustomerSession();
  redirect("/");
}
