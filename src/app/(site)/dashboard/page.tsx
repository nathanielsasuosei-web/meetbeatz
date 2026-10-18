import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/(site)/account/actions";
import { getCustomerById, getCustomerSession } from "@/lib/customer-auth";
import { loadAccountData } from "@/lib/account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Student Dashboard" };

export default async function DashboardPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/account/login");
  const customer = await getCustomerById(session.id);
  const { orders, bookings } = await loadAccountData(session);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Student Dashboard</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">Welcome, {customer?.name ?? session.name} · Student ID <span className="font-mono text-acid">{customer?.studentId ?? "—"}</span></p>
        </div>
        <div className="flex gap-3">
          <Link href="/account" className="btn-ghost">My Account</Link>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost">Sign out</button>
          </form>
        </div>
      </div>

      <section className="mt-8">
        <div className="card overflow-hidden p-0">
          <div className="bg-gradient-to-br from-acid/20 via-acid/5 to-transparent px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Student ID Card</p>
                <h2 className="mt-2 text-2xl font-bold">Student Profile</h2>
                <p className="mt-1 text-sm text-muted">Your dashboard and account share this ID.</p>
              </div>
              <div className="rounded-2xl border border-acid/30 bg-black/20 px-5 py-3 text-center backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-acid">Student ID</p>
                <p className="mt-1 font-mono text-xl font-bold text-cream">{customer?.studentId ?? "Generating…"}</p>
                <p className="mt-1 text-xs text-muted">{customer?.country || ""}{customer?.city ? ` · ${customer.city}` : ""}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Full Name</p>
                <p className="mt-1 font-semibold text-cream">{customer?.name ?? session.name}</p>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Age</p>
                <p className="mt-1 font-semibold text-cream">{customer?.age ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Country</p>
                <p className="mt-1 font-semibold text-cream">{customer?.country || "—"}</p>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">City</p>
                <p className="mt-1 font-semibold text-cream">{customer?.city || "—"}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <span className="badge">Dashboard: {customer?.provider ?? "local"}</span>
              <span className="badge-acid border border-acid/30 px-3 py-1">{customer?.email ?? session.email}</span>
            </div>
          </div>
          <div className="border-t border-line px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Your ID is visible on your account page and dashboard. Use it for studio bookings and support.</p>
              <Link href="/account" className="text-xs font-semibold text-acid hover:underline">Go to Account →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-6 sm:grid-cols-3">
        <div className="card p-6">
          <p className="eyebrow">Orders</p>
          <p className="mt-2 text-3xl font-bold">{orders.length}</p>
          <p className="mt-1 text-sm text-muted">Total orders</p>
        </div>
        <div className="card p-6">
          <p className="eyebrow">Bookings</p>
          <p className="mt-2 text-3xl font-bold">{bookings.length}</p>
          <p className="mt-1 text-sm text-muted">Studio sessions</p>
        </div>
        <div className="card p-6">
          <p className="eyebrow">Student ID</p>
          <p className="mt-2 font-mono text-lg font-bold text-acid">{customer?.studentId ?? "—"}</p>
          <p className="mt-1 text-sm text-muted">Keep this ID safe</p>
        </div>
      </section>

      <section className="mt-8 flex flex-wrap gap-3">
        <Link href="/beats" className="btn-primary">Browse Beats</Link>
        <Link href="/studio" className="btn-ghost">Book Studio</Link>
        <Link href="/account" className="btn-ghost">Account Settings</Link>
      </section>
    </div>
  );
}
