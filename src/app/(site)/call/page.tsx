import type { Metadata } from "next";
import Link from "next/link";
import { VoiceCall } from "@/components/calls/voice-call";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private audio call" };

export default async function AudioCallPage() {
  const [artist, producer] = await Promise.all([getCustomerSession(), getAdminSession()]);

  if (producer) return <VoiceCall role="producer" name={producer.name} />;
  if (artist) return <VoiceCall role="artist" name={artist.name} />;

  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <div className="card p-8 text-center">
        <p className="eyebrow">Private artist ↔ producer call</p>
        <h1 className="display mt-3 text-4xl">Sign in to call.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Audio calls are only available between a signed-in artist and the Meetbeatz producer.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/account/login" className="btn-primary">Artist sign in</Link>
          <Link href="/admin/login" className="btn-ghost">Producer sign in</Link>
        </div>
      </div>
    </div>
  );
}
