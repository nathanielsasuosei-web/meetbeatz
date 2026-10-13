import type { Metadata } from "next";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { beats, customers } from "@/db/schema";
import { Flash, PageHeader } from "@/components/admin/flash";
import { LiveRecordingStudio } from "@/components/live-recording-studio";
import { requireAdmin } from "@/lib/auth";
import { getSettings, isLiveRecordingOpen } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Producer Live Recording" };

export default async function AdminLiveRecordingPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [session, siteSettings, { msg, err }, publishedBeats, artists] = await Promise.all([
    requireAdmin(),
    getSettings(),
    searchParams,
    db
      .select({
        id: beats.id,
        title: beats.title,
        bpm: beats.bpm,
        musicalKey: beats.musicalKey,
      })
      .from(beats)
      .orderBy(desc(beats.isFeatured), desc(beats.createdAt))
      .limit(50),
    db
      .select({ id: customers.id, name: customers.name, email: customers.email })
      .from(customers)
      .where(ne(customers.email, "artist-caller@meetbeatz.local"))
      .orderBy(asc(customers.name), desc(customers.id))
      .limit(100),
  ]);

  const open = isLiveRecordingOpen(siteSettings);

  return (
    <>
      <PageHeader eyebrow="Virtual studio booth" title="Live recording">
        <p className="text-sm text-muted">
          Keep Live Recording set to <strong>Coming soon</strong> for artists until you are ready, or open it anytime with one click.
        </p>
      </PageHeader>
      <Flash msg={msg} err={err} />
      <LiveRecordingStudio
        initialOpen={open}
        isProducer={true}
        producerName={session.name}
        beats={publishedBeats.map((b) => ({
          id: b.id,
          title: b.title,
          bpm: b.bpm,
          musicalKey: b.musicalKey,
          previewUrl: `/api/beats/${b.id}/preview`,
        }))}
        artists={artists}
      />
    </>
  );
}
