import type { Metadata } from "next";
import Link from "next/link";
import { CartCheckout } from "@/components/cart/cart-checkout";
import { getCustomerSession } from "@/lib/customer-auth";
import { getSettings } from "@/lib/settings";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [settings, account] = await Promise.all([getSettings(), getCustomerSession()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Link href="/beats" className="text-sm font-semibold text-muted hover:text-cream">← Back to beats</Link>
      <CartCheckout feePercent={num(settings.feePercent)} currency={settings.currency} account={account} />
    </div>
  );
}
