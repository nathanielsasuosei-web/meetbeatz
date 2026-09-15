import { getAvailableSlots } from "@/lib/slots";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSeeded();
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const hours = Math.max(1, Math.min(12, parseInt(url.searchParams.get("hours") ?? "1", 10) || 1));
  const result = await getAvailableSlots(date, hours);
  return Response.json(result);
}
