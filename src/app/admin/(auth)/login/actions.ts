"use server";

import { redirect } from "next/navigation";
import { authenticateAdmin, createAdminSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureSeeded();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const admin = await authenticateAdmin(email, password);
  if (!admin) return { error: "Incorrect email or password." };
  await createAdminSession(admin);
  redirect("/admin");
}
