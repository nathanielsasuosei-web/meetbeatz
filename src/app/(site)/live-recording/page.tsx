import type { Metadata } from "next";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { beats, customers } from "@/db/schema";
import { LiveRecordingStudio } from "@/components/live-recording-studio";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { getSettings, isLiveRecordingOpen } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live Recording Studio",
  description: "Record live vocal takes over Meetbeatz beats and send them directly to the studio.",
};

export default async function LiveRecordingPage() {
  const [siteSettings, customer, producer, publishedBeats] = await Promise.all([
    getSettings(),
    getCustomerSession(),
    getAdminSession(),
    db
      .select({
        id: beats.id,
        title: beats.title,
        bpm: beats.bpm,
        musicalKey: beats.musicalKey,
      })
      .from(beats)
      .where(eq(beats.isPublished, true))
      .orderBy(desc(beats.isFeatured), desc(beats.createdAt))
      .limit(50),
  ]);

  const open = isLiveRecordingOpen(siteSettings);
  const isProducer = Boolean(producer);

  const artists = isProducer
    ? await db
        .select({ id: customers.id, name: customers.name, email: customers.email })
        .from(customers)
        .where(ne(customers.email, "artist-caller@meetbeatz.local"))
        .orderBy(asc(customers.name), desc(customers.id))
        .limit(100)
    : [];

  return (
    <LiveRecordingStudio
      initialOpen={open}
      isProducer={isProducer}
      producerName={producer?.name ?? null}
      customer={customer ? { id: customer.id, name: customer.name } : null}
      beats={publishedBeats.map((b) => ({
        id: b.id,
        title: b.title,
        bpm: b.bpm,
        musicalKey: b.musicalKey,
        previewUrl: `/api/beats/${b.id}/preview`,
      }))}
      artists={artists}
    />
  );
}
