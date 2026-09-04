import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { emailProvider, getPaymentMode, getSettings } from "@/lib/settings";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const session = await requireAdmin();
  const settings = await getSettings();
  const mode = getPaymentMode();
  const email = emailProvider();
  const warnings: string[] = [];
  if (mode === "simulation") warnings.push("Payments are in TEST mode — add PAYSTACK_SECRET_KEY to accept real Mobile Money payments.");
  if (mode === "paystack" && !settings.paystackSubaccount) warnings.push("No payout subaccount set — 100% of payments will settle to the main Paystack account. Configure the split in Settings.");
  if (email === "none") warnings.push("Email delivery is not configured — customers will not receive files by email until SMTP or Resend is set up.");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-ink-2 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="mb-4 flex items-center justify-between lg:mb-8 lg:block">
          <Link href="/admin" className="display text-lg tracking-[0.18em]">
            MEET<span className="text-acid">BEATZ</span>
          </Link>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted lg:mt-1">Producer dashboard</p>
        </div>
        <AdminNav />
        <div className="mt-6 hidden border-t border-line pt-4 lg:block">
          <p className="truncate text-xs font-semibold">{session.name}</p>
          <p className="truncate text-[11px] text-muted">{session.email}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/" className="btn-ghost px-3! py-1.5! text-xs">
              View site
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost px-3! py-1.5! text-xs">
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <p className="text-xs text-muted">{session.email}</p>
          <div className="flex gap-2">
            <Link href="/" className="btn-ghost px-3! py-1.5! text-xs">
              View site
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost px-3! py-1.5! text-xs">
                Log out
              </button>
            </form>
          </div>
        </header>
        {warnings.length > 0 && (
          <div className="space-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 sm:px-8">
            {warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        )}
        <main className="px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
