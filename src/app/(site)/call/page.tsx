import type { Metadata } from "next";
import Link from "next/link";
import { VoiceCall } from "@/components/calls/voice-call";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Call Meetbeatz Producer" };

export default async function AudioCallPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; autoAccept?: string }>;
}) {
  const [{ role: requestedRole, autoAccept }, artist, producer] = await Promise.all([
    searchParams,
    getCustomerSession(),
    getAdminSession(),
  ]);

  const autoAcceptId = autoAccept ? parseInt(autoAccept, 10) : null;
  const validAutoAcceptId = Number.isFinite(autoAcceptId) ? autoAcceptId : null;

  if (requestedRole === "producer" && producer) {
    return (
      <VoiceCall
        role="producer"
        name={producer.name}
        autoAcceptCallId={validAutoAcceptId}
      />
    );
  }

  return (
    <div>
      <VoiceCall
        role="artist"
        name={artist?.name ?? "Artist"}
        autoAcceptCallId={validAutoAcceptId}
        hasAccount={Boolean(artist)}
      />
      {producer && (
        <div className="mx-auto -mt-6 mb-10 max-w-2xl px-4 text-center sm:px-6">
          <Link
            href="/admin/call"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-muted transition hover:border-acid/40 hover:text-cream"
          >
            Looking for the Producer receiver &amp; artist caller screen? Open Producer Audio Call →
          </Link>
        </div>
      )}
    </div>
  );
}
