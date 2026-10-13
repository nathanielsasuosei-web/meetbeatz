"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Equalizer, PhoneIcon } from "@/components/icons";
import { startIncomingRingtone } from "@/lib/call-ringtone";

type RingingCall = {
  id: number;
  customerId: number;
  status: string;
  callerRole?: "artist" | "producer";
};

/**
 * Watches for incoming calls from the Meetbeatz Producer for a signed-in artist
 * across the entire site (except `/call`, which already renders `VoiceCall`).
 * Plays an audible ringing alert and displays animated Accept / Decline buttons.
 */
export function ArtistIncomingCallAlert({ customer }: { customer: { name: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ringingCall, setRingingCall] = useState<RingingCall | null>(null);
  const [busy, setBusy] = useState(false);

  const isCallPage = pathname === "/call";

  const checkIncoming = useCallback(async () => {
    if (!customer || isCallPage) {
      setRingingCall(null);
      return;
    }
    try {
      const res = await fetch("/api/calls?role=artist", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        call?: RingingCall | null;
      };
      if (data.call && data.call.status === "ringing" && data.call.callerRole === "producer") {
        setRingingCall(data.call);
      } else {
        setRingingCall(null);
      }
    } catch {
      // Ignore transient network poll errors
    }
  }, [customer, isCallPage]);

  useEffect(() => {
    if (!customer || isCallPage) {
      setRingingCall(null);
      return;
    }
    void checkIncoming();
    const timer = window.setInterval(() => void checkIncoming(), 1500);
    return () => window.clearInterval(timer);
  }, [checkIncoming, customer, isCallPage]);

  useEffect(() => {
    if (!ringingCall || isCallPage) return undefined;
    return startIncomingRingtone();
  }, [ringingCall, isCallPage]);

  async function handleAccept() {
    if (!ringingCall || busy) return;
    setBusy(true);
    const id = ringingCall.id;
    setRingingCall(null);
    router.push(`/call?autoAccept=${id}`);
    setBusy(false);
  }

  async function handleDecline() {
    if (!ringingCall || busy) return;
    setBusy(true);
    try {
      await fetch("/api/calls?role=artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", callId: ringingCall.id, role: "artist" }),
      });
    } catch {
      // Ignore error on decline
    } finally {
      setRingingCall(null);
      setBusy(false);
    }
  }

  if (!customer || !ringingCall || isCallPage) return null;

  return (
    <div
      className="fixed inset-x-4 top-20 z-[80] mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:top-20 sm:w-[25rem]"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Incoming audio call from Meetbeatz Producer"
    >
      <div className="incoming-call-toast overflow-hidden rounded-3xl border-2 border-[#25d366]/70 bg-[#0d1914]/95 p-5 text-cream shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_50px_rgba(37,211,102,0.35)] backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#25d366]/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#39dc78]">
            <span className="h-2 w-2 rounded-full bg-[#39dc78] animate-ping" />
            Incoming Producer Call
          </span>
          <Equalizer className="text-[#39dc78]" />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="call-avatar is-ringing grid h-16 w-16 shrink-0 place-items-center rounded-full text-lg font-black">
            MB
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black text-cream">Meetbeatz Producer</p>
            <p className="text-xs text-cream/75">Direct studio audio call · Ringing now…</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={busy}
            className="call-accept-animated flex-1 justify-center !py-3 !text-xs"
          >
            <span className="call-btn-icon">
              <PhoneIcon className="h-4 w-4 animate-phone-ring" />
            </span>
            <span>{busy ? "Connecting…" : "Accept"}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDecline()}
            disabled={busy}
            className="call-decline-animated flex-1 justify-center !py-3 !text-xs"
          >
            <span className="call-btn-icon">
              <PhoneIcon className="h-4 w-4 rotate-[135deg]" />
            </span>
            <span>Decline</span>
          </button>
        </div>
      </div>
    </div>
  );
}
