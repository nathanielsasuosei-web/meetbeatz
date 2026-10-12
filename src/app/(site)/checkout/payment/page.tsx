import type { Metadata } from "next";
import Link from "next/link";
import { CartCheckout } from "@/components/cart/cart-checkout";
import { getCustomerSession } from "@/lib/customer-auth";
import { getSettings } from "@/lib/settings";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Payment details" };
export const dynamic = "force-dynamic";

type PaymentPageParams = { method?: string };

export default async function PaymentDetailsPage({ searchParams }: { searchParams: Promise<PaymentPageParams> }) {
  const { method } = await searchParams;
  const selectedMethod = method === "global" ? "global" : "ghana";
  const [settings, account] = await Promise.all([getSettings(), getCustomerSession()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Link href="/cart" className="text-sm font-semibold text-muted hover:text-cream">← Back to payment methods</Link>
      <CartCheckout
        feePercent={num(settings.feePercent)}
        currency={settings.currency}
        account={account}
        stage="details"
        initialPaymentMethod={selectedMethod}
      />
    </div>
  );
}
