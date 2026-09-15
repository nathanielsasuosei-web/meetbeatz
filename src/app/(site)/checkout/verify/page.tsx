import { redirect } from "next/navigation";
import { verifyPaystackAndFinalize } from "@/lib/payments";
import { getPaymentMode } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  await ensureSeeded();
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference) redirect("/beats");
  if (getPaymentMode() === "paystack") {
    await verifyPaystackAndFinalize(reference);
  }
  redirect(`/orders/${encodeURIComponent(reference)}`);
}
