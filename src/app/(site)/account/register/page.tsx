import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerRegisterForm } from "@/components/account/auth-forms";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

export default async function AccountRegisterPage() {
  const session = await getCustomerSession();
  if (session) redirect("/account");
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <p className="eyebrow">Your account</p>
      <h1 className="display mt-2 text-4xl">Create your account</h1>
      <p className="mt-3 text-sm text-muted">
        Keep every beat you buy in one place — files, license certificates and studio bookings — and chat with us
        directly.
      </p>
      <div className="card mt-8 p-6">
        <CustomerRegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/beats" className="hover:text-cream">
          ← Back to the beats
        </Link>
      </p>
    </div>
  );
}
