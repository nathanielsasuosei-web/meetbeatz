import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { createSubaccount } from "@/lib/paystack";
import { getSettings, saveSettings } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { businessName?: string; bankCode?: string; accountNumber?: string };
  if (!body.bankCode || !body.accountNumber) return Response.json({ error: "Bank/network and account number are required" }, { status: 400 });
  try {
    const settings = await getSettings();
    // percentage_charge = share kept by the MAIN account. The per-transaction
    // transaction_charge override (the exact fee amount) is applied at checkout.
    const result = await createSubaccount({
      businessName: body.businessName?.trim() || settings.siteName,
      settlementBank: body.bankCode,
      accountNumber: body.accountNumber.trim(),
      percentageCharge: Number(settings.feePercent) || 10,
    });
    await saveSettings({ paystackSubaccount: result.subaccount_code });
    revalidatePath("/admin/settings");
    return Response.json({ subaccountCode: result.subaccount_code });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to create subaccount" }, { status: 500 });
  }
}
