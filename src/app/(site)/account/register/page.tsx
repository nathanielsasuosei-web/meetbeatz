import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerRegisterForm } from "@/components/account/auth-forms";
import { SpotlightCard } from "@/components/account/spotlight-card";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

export default async function AccountRegisterPage() {
  const session = await getCustomerSession();
  if (session) redirect("/account");
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <p className="eyebrow auth-in">
        <span className="eq-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        Your account
      </p>
      <h1 className="display auth-in mt-3 text-4xl" style={{ animationDelay: "90ms" }}>
        Create your account
      </h1>
      <p className="auth-in mt-3 text-sm text-muted" style={{ animationDelay: "180ms" }}>
        Keep every beat you buy in one place — files, license certificates and studio bookings — and chat with us
        directly.
      </p>
      <SpotlightCard className="auth-in mt-8 p-6" style={{ animationDelay: "270ms" }}>
        <CustomerRegisterForm />
      </SpotlightCard>
      <p className="auth-in mt-6 text-center text-sm text-muted" style={{ animationDelay: "430ms" }}>
        <Link href="/beats" className="hover:text-cream">
          ← Back to the beats
        </Link>
      </p>
    </div>
  );
}
