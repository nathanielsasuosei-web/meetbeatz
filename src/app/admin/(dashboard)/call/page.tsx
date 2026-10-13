import type { Metadata } from "next";
import { VoiceCall } from "@/components/calls/voice-call";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Producer Audio Call" };

export default async function AdminCallPage({
  searchParams,
}: {
  searchParams: Promise<{ autoAccept?: string }>;
}) {
  const [session, { autoAccept }] = await Promise.all([requireAdmin(), searchParams]);
  const autoAcceptId = autoAccept ? parseInt(autoAccept, 10) : null;

  return (
    <VoiceCall
      role="producer"
      name={session.name}
      autoAcceptCallId={Number.isFinite(autoAcceptId) ? autoAcceptId : null}
    />
  );
}
