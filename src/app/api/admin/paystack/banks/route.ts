import { getAdminSession } from "@/lib/auth";
import { listGhanaBanks } from "@/lib/paystack";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const type = new URL(req.url).searchParams.get("type") === "ghipss" ? "ghipss" : "mobile_money";
  try {
    const banks = await listGhanaBanks(type);
    return Response.json({ banks: banks.map((b) => ({ name: b.name, code: b.code })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load banks" }, { status: 500 });
  }
}
