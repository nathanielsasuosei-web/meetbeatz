import { getAdminSession } from "@/lib/auth";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Small authenticated polling endpoint used by the producer dashboard. It
 * keeps the notification badge and the "new booking" toast current without
 * exposing booking details publicly.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [unread, latest] = await Promise.all([countUnreadNotifications(), listNotifications(5)]);
  return Response.json(
    {
      unread,
      latest: latest.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        link: item.link,
        createdAt: item.createdAt.toISOString(),
        read: item.read,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
