import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { getSettings, isLiveRecordingOpen, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const [admin, siteSettings] = await Promise.all([getAdminSession(), getSettings()]);
  return Response.json({
    open: isLiveRecordingOpen(siteSettings),
    isProducer: Boolean(admin),
  });
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return Response.json({ error: "Only the producer can open or close Live Recording." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { open?: boolean };
  const nextValue = body.open ? "1" : "0";
  await saveSettings({ liveRecordingOpen: nextValue });
  revalidatePath("/", "layout");
  return Response.json({
    open: nextValue === "1",
    isProducer: true,
  });
}
