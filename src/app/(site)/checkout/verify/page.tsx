import { redirect } from "next/navigation";
import { verifyPaystackAndFinalize } from "@/lib/payments";
import { getPaymentMode } from "@/lib/settings";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference) redirect("/beats");
  if (getPaymentMode() === "paystack") {
    await verifyPaystackAndFinalize(reference);
  }
  redirect(`/orders/${encodeURIComponent(reference)}`);
}
