"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Equalizer, MicIcon, PhoneIcon } from "@/components/icons";
import { startIncomingRingtone, startOutgoingRingback } from "@/lib/call-ringtone";

type CallRole = "artist" | "producer";
type CallStatus = "ringing" | "accepted" | "missed" | "declined" | "cancelled" | "ended";
type CallPhase = "idle" | "calling" | "incoming" | "connecting" | "connected" | "ended" | "error";
type SignalKind = "offer" | "answer" | "ice-candidate";

type VoiceCallRecord = {
  id: number;
  customerId: number;
  status: CallStatus;
  callerRole?: CallRole;
  createdAt: string;
  updatedAt: string;
};

type CallableArtist = {
  id: number;
  name: string;
  email: string;
};

type CallSignal = {
  id: number;
  callId: number;
  senderRole: CallRole;
  recipientRole: CallRole;
  kind: SignalKind;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  createdAt: string;
};

type CallsResponse = {
  call: VoiceCallRecord | null;
  customerName?: string | null;
  signals?: CallSignal[];
  artists?: CallableArtist[];
  error?: string;
};

type CallAction = {
  action: "start" | "accept" | "decline" | "cancel" | "end" | "signal";
  callId?: number;
  customerId?: number;
  kind?: SignalKind;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit;
  role?: CallRole;
};

const ACTIVE_STATUSES: CallStatus[] = ["ringing", "accepted"];
const TERMINAL_STATUSES: CallStatus[] = ["missed", "declined", "cancelled", "ended"];
const POLL_MS = 1200;

function messageForError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow microphone access in your browser, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  return error instanceof Error ? error.message : "The audio call could not connect.";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function VoiceCall({
  role,
  name,
  autoAcceptCallId,
  initialCustomerId,
  autoStart,
  hasAccount,
}: {
  role: CallRole;
  name: string;
  autoAcceptCallId?: number | null;
  initialCustomerId?: number | null;
  autoStart?: boolean;
  hasAccount?: boolean;
}) {
  const [call, setCall] = useState<VoiceCallRecord | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [artists, setArtists] = useState<CallableArtist[]>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(initialCustomerId ?? null);
  const [muted, setMuted] = useState(false);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveRecordingOpen, setLiveRecordingOpen] = useState(false);
  const [togglingLiveRec, setTogglingLiveRec] = useState(false);

  const callRef = useRef<VoiceCallRecord | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerCallIdRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSignalIdRef = useRef(0);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const offerStartedCallRef = useRef<number | null>(null);
  const autoAcceptedRef = useRef<number | null>(null);
  const autoStartedRef = useRef(false);
  const pollingRef = useRef(false);

  const updateCall = useCallback((next: VoiceCallRecord | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const updatePhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const isCallAccepted = useCallback((callId: number) => {
    const current = callRef.current;
    return current?.id === callId && current.status === "accepted";
  }, []);

  const postAction = useCallback(
    async (body: CallAction): Promise<CallsResponse> => {
      const response = await fetch(`/api/calls?role=${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, role }),
      });
      const data = (await response.json().catch(() => ({}))) as CallsResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not update the call.");
      return data;
    },
    [role],
  );

  const cleanupPeer = useCallback(() => {
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerCallIdRef.current = null;
    offerStartedCallRef.current = null;
    queuedCandidatesRef.current = [];
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    setMuted(false);
    setAudioNeedsGesture(false);
  }, []);

  const ensurePeerConnection = useCallback(
    async (callId: number) => {
      if (peerRef.current && peerCallIdRef.current === callId) return peerRef.current;
      if (peerRef.current) cleanupPeer();
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot access a microphone. Open the call on HTTPS or localhost in a supported browser.");
      }
      let iceServers = iceServersRef.current;
      if (!iceServers) {
        const configResponse = await fetch(`/api/calls/ice-config?role=${role}`, { cache: "no-store" });
        const config = (await configResponse.json().catch(() => ({}))) as { error?: string; iceServers?: RTCIceServer[] };
        if (!configResponse.ok || !Array.isArray(config.iceServers)) {
          throw new Error(config.error ?? "Could not prepare the audio connection.");
        }
        iceServers = config.iceServers;
        iceServersRef.current = iceServers;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const peer = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
      peerRef.current = peer;
      peerCallIdRef.current = callId;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        void postAction({ action: "signal", callId, kind: "ice-candidate", payload: event.candidate.toJSON() }).catch((sendError) => {
          if (callRef.current?.id === callId && ACTIVE_STATUSES.includes(callRef.current.status)) {
            setError(messageForError(sendError));
          }
        });
      };
      peer.ontrack = (event) => {
        if (!remoteAudioRef.current) return;
        remoteAudioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void remoteAudioRef.current
          .play()
          .then(() => setAudioNeedsGesture(false))
          .catch(() => {
            setAudioNeedsGesture(true);
            setError("Call connected. Tap play on the audio controls to hear the other caller.");
          });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          updatePhase("connected");
          setError(null);
        } else if (peer.connectionState === "failed") {
          updatePhase("error");
          setError("The browser could not connect the call. Check the network and try again.");
        }
      };
      return peer;
    },
    [cleanupPeer, postAction, role, updatePhase],
  );

  const flushQueuedCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const queued = queuedCandidatesRef.current.splice(0);
    for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  const handleSignal = useCallback(
    async (signal: CallSignal) => {
      if (signal.kind === "offer" && role === "producer") {
        const peer = await ensurePeerConnection(signal.callId);
        if (!isCallAccepted(signal.callId)) {
          if (peerCallIdRef.current === signal.callId) cleanupPeer();
          return;
        }
        if (!peer.remoteDescription) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          if (!isCallAccepted(signal.callId)) {
            if (peerCallIdRef.current === signal.callId) cleanupPeer();
            return;
          }
          await flushQueuedCandidates(peer);
          const answer = await peer.createAnswer();
          if (!isCallAccepted(signal.callId)) {
            if (peerCallIdRef.current === signal.callId) cleanupPeer();
            return;
          }
          await peer.setLocalDescription(answer);
          if (!isCallAccepted(signal.callId)) {
            if (peerCallIdRef.current === signal.callId) cleanupPeer();
            return;
          }
          if (!peer.localDescription) throw new Error("Could not create an audio answer.");
          await postAction({ action: "signal", callId: signal.callId, kind: "answer", payload: peer.localDescription.toJSON() });
          if (isCallAccepted(signal.callId)) updatePhase("connecting");
        }
        return;
      }

      if (signal.kind === "answer" && role === "artist") {
        const peer = peerRef.current;
        if (peer && !peer.remoteDescription && isCallAccepted(signal.callId)) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          if (isCallAccepted(signal.callId) && peerRef.current === peer) await flushQueuedCandidates(peer);
        }
        return;
      }

      if (signal.kind === "ice-candidate" && isCallAccepted(signal.callId)) {
        const candidate = signal.payload as RTCIceCandidateInit;
        const peer = peerRef.current;
        if (peer?.remoteDescription && peerCallIdRef.current === signal.callId) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          queuedCandidatesRef.current.push(candidate);
        }
      }
    },
    [cleanupPeer, ensurePeerConnection, flushQueuedCandidates, isCallAccepted, postAction, role, updatePhase],
  );

  const createArtistOffer = useCallback(
    async (callId: number) => {
      if (offerStartedCallRef.current === callId) return;
      offerStartedCallRef.current = callId;
      try {
        updatePhase("connecting");
        const peer = await ensurePeerConnection(callId);
        if (!isCallAccepted(callId)) {
          if (peerCallIdRef.current === callId) cleanupPeer();
          return;
        }
        const offer = await peer.createOffer();
        if (!isCallAccepted(callId)) {
          if (peerCallIdRef.current === callId) cleanupPeer();
          return;
        }
        await peer.setLocalDescription(offer);
        if (!isCallAccepted(callId)) {
          if (peerCallIdRef.current === callId) cleanupPeer();
          return;
        }
        if (!peer.localDescription) throw new Error("Could not create an audio offer.");
        await postAction({ action: "signal", callId, kind: "offer", payload: peer.localDescription.toJSON() });
      } catch (callError) {
        if (isCallAccepted(callId)) {
          setError(messageForError(callError));
          updatePhase("error");
        }
      }
    },
    [cleanupPeer, ensurePeerConnection, isCallAccepted, postAction, updatePhase],
  );

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const current = callRef.current;
      const shouldFollowCurrent = !!current && (current.callerRole === role || ACTIVE_STATUSES.includes(current.status));
      const query = new URLSearchParams();
      query.set("role", role);
      if (shouldFollowCurrent && current) query.set("callId", String(current.id));
      query.set("after", String(shouldFollowCurrent ? lastSignalIdRef.current : 0));
      const response = await fetch(`/api/calls?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as CallsResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not check the call.");

      if (Array.isArray(data.artists)) {
        const fetchedArtists = data.artists;
        setArtists(fetchedArtists);
        setSelectedArtistId((prev) => {
          if (prev && fetchedArtists.some((a) => a.id === prev)) return prev;
          if (initialCustomerId && fetchedArtists.some((a) => a.id === initialCustomerId)) return initialCustomerId;
          return fetchedArtists[0]?.id ?? null;
        });
      }

      if (!data.call) {
        if (!callRef.current) updatePhase("idle");
        return;
      }

      const previous = callRef.current;
      if (previous?.id !== data.call.id) {
        cleanupPeer();
        lastSignalIdRef.current = 0;
        queuedCandidatesRef.current = [];
        setError(null);
      }
      updateCall(data.call);
      setRemoteName(data.customerName ?? null);

      const callerRole: CallRole = data.call.callerRole ?? "artist";
      if (data.call.status === "ringing") {
        updatePhase(callerRole !== role ? "incoming" : "calling");
      } else if (data.call.status === "accepted") {
        if (phaseRef.current !== "connected" && phaseRef.current !== "error") updatePhase("connecting");
        if (role === "artist") void createArtistOffer(data.call.id);
      } else if ((TERMINAL_STATUSES as string[]).includes(data.call.status)) {
        cleanupPeer();
        updatePhase("ended");
      }

      const signals = data.call.status === "accepted" ? data.signals ?? [] : [];
      for (const signal of signals) {
        if (signal.id <= lastSignalIdRef.current) continue;
        try {
          await handleSignal(signal);
          lastSignalIdRef.current = signal.id;
        } catch (signalError) {
          if (isCallAccepted(signal.callId)) {
            setError(messageForError(signalError));
            updatePhase("error");
          }
          lastSignalIdRef.current = signal.id;
          break;
        }
      }
    } catch (pollError) {
      // Do not let one lost poll close an otherwise active call.
      if (!callRef.current) setError(messageForError(pollError));
    } finally {
      pollingRef.current = false;
    }
  }, [cleanupPeer, createArtistOffer, handleSignal, initialCustomerId, isCallAccepted, role, updateCall, updatePhase]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/live-recording", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { open?: boolean } | null) => {
        if (active && data && typeof data.open === "boolean") {
          setLiveRecordingOpen(data.open);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function toggleLiveRecordingAccess(nextOpen: boolean) {
    if (role !== "producer" || togglingLiveRec) return;
    setTogglingLiveRec(true);
    try {
      const res = await fetch("/api/admin/live-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: nextOpen }),
      });
      const data = (await res.json().catch(() => ({}))) as { open?: boolean };
      if (res.ok && typeof data.open === "boolean") {
        setLiveRecordingOpen(data.open);
      }
    } finally {
      setTogglingLiveRec(false);
    }
  }

  // Play incoming ringing alert sound for the callee, and outgoing ringback tone for the caller
  useEffect(() => {
    if (phase === "incoming" && call?.status === "ringing") {
      return startIncomingRingtone();
    }
    if (phase === "calling" && call?.status === "ringing") {
      return startOutgoingRingback();
    }
    return undefined;
  }, [phase, call?.status]);

  // Live timer while call is active
  useEffect(() => {
    if (phase !== "connected" && phase !== "connecting") {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const current = call;
    if (!current || current.status !== "accepted") return;
    const onPageHide = () => {
      const payload = new Blob([JSON.stringify({ action: "end", callId: current.id, role })], { type: "application/json" });
      navigator.sendBeacon(`/api/calls?role=${role}`, payload);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [call, role]);

  const answerCall = useCallback(
    async (action: "accept" | "decline", targetCallId?: number) => {
      const id = targetCallId ?? callRef.current?.id;
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        const result = await postAction({ action, callId: id });
        if (result.call) updateCall(result.call);
        if (action === "accept") {
          updatePhase("connecting");
        } else {
          cleanupPeer();
          updatePhase("ended");
        }
      } catch (callError) {
        setError(messageForError(callError));
      } finally {
        setBusy(false);
      }
    },
    [cleanupPeer, postAction, updateCall, updatePhase],
  );

  // Auto-accept when redirected from the global incoming call alert (works for both producer and artist)
  useEffect(() => {
    if (!autoAcceptCallId) return;
    const callerRole = call?.callerRole ?? "artist";
    if (call?.id === autoAcceptCallId && call.status === "ringing" && callerRole !== role && autoAcceptedRef.current !== autoAcceptCallId) {
      autoAcceptedRef.current = autoAcceptCallId;
      void answerCall("accept", autoAcceptCallId);
    }
  }, [answerCall, autoAcceptCallId, call, role]);

  const startCall = useCallback(
    async (targetCustomerId?: number) => {
      setBusy(true);
      setError(null);
      lastSignalIdRef.current = 0;
      cleanupPeer();
      try {
        if (role === "producer") {
          const customerId = targetCustomerId ?? selectedArtistId;
          if (!customerId) {
            throw new Error("Select a registered artist with an account to call.");
          }
          const result = await postAction({ action: "start", customerId });
          if (!result.call) throw new Error("Could not start the call.");
          updateCall(result.call);
          const picked = artists.find((a) => a.id === customerId);
          setRemoteName(result.customerName ?? picked?.name ?? "Artist");
          updatePhase(result.call.status === "accepted" ? "connecting" : "calling");
        } else {
          const result = await postAction({ action: "start" });
          if (!result.call) throw new Error("Could not start the call.");
          updateCall(result.call);
          setRemoteName("Meetbeatz Producer");
          updatePhase(result.call.status === "accepted" ? "connecting" : "calling");
        }
      } catch (callError) {
        setError(messageForError(callError));
        updatePhase("error");
      } finally {
        setBusy(false);
      }
    },
    [artists, cleanupPeer, postAction, role, selectedArtistId, updateCall, updatePhase],
  );

  // Auto-start call when producer navigates from Messages with ?customerId=X&autoStart=1
  useEffect(() => {
    if (role !== "producer" || !autoStart || !initialCustomerId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startCall(initialCustomerId);
  }, [autoStart, initialCustomerId, role, startCall]);

  async function endCall() {
    if (!call) return;
    setBusy(true);
    setError(null);
    const callerRole = call.callerRole ?? "artist";
    const action = call.status === "ringing" ? (callerRole === role ? "cancel" : "decline") : "end";
    try {
      const result = await postAction({ action, callId: call.id });
      if (result.call) updateCall(result.call);
    } catch (callError) {
      setError(messageForError(callError));
    } finally {
      cleanupPeer();
      updatePhase("ended");
      setBusy(false);
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }

  function returnToWaiting() {
    updateCall(null);
    setRemoteName(null);
    setError(null);
    lastSignalIdRef.current = 0;
    updatePhase("idle");
  }

  const selectedArtist = artists.find((a) => a.id === selectedArtistId) ?? null;
  const participant =
    role === "artist"
      ? "Meetbeatz Producer"
      : remoteName ?? selectedArtist?.name ?? "Artist";

  const initials =
    role === "artist"
      ? "MB"
      : participant
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("") || "A";

  const callCallerRole: CallRole = call?.callerRole ?? "artist";
  const isIncomingRinging = call?.status === "ringing" && callCallerRole !== role;
  const isOutgoingRinging = call?.status === "ringing" && callCallerRole === role;

  // ---------------------------------------------------------------------------
  // PRODUCER VIEW: Producer waiting & incoming call receiver + ability for
  // producer to directly call any registered artist who has an account.
  // ---------------------------------------------------------------------------
  if (role === "producer") {
    const producerStatusCopy: Record<CallPhase, string> = {
      idle: "Waiting for an artist to call — or select an artist account below to call them.",
      calling: `Ringing ${participant}…`,
      incoming: `Incoming audio call from ${participant} — ringing now!`,
      connecting: "Connecting audio…",
      connected: `Call connected · ${formatDuration(elapsedSeconds)}`,
      ended:
        call?.status === "missed"
          ? "No answer — call missed"
          : call?.status === "declined"
            ? "Call declined"
            : "Call ended",
      error: "Call needs attention",
    };

    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <section
          className={`card overflow-hidden p-0 transition-all duration-300 ${
            phase === "incoming"
              ? "ring-2 ring-[#25d366]/80 shadow-[0_0_60px_-10px_rgba(37,211,102,0.45)]"
              : ""
          }`}
        >
          <header className="border-b border-line p-6 sm:p-8">
            <p className="eyebrow">Private · artist ↔ producer</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <h1 className="display text-4xl sm:text-5xl">Audio call</h1>
              <span className="badge">Producer</span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Signed in as <span className="text-cream/80">{name}</span>. Leave this window open to receive private audio calls from artists, or call any registered artist with an account below. Your browser will ask for microphone access when the call is answered.
            </p>
          </header>

          {isIncomingRinging && (
            <div
              role="alert"
              aria-live="assertive"
              className="incoming-call-banner flex items-center justify-between gap-3 border-b border-[#25d366]/40 bg-[#25d366]/15 px-6 py-3.5 text-sm font-bold text-cream"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25d366] text-ink shadow-lg">
                  <PhoneIcon className="h-4 w-4 animate-phone-ring" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#25d366]">Incoming ringing alert</p>
                  <p className="text-sm font-bold text-cream">{participant} is calling the studio right now</p>
                </div>
              </div>
              <Equalizer className="text-[#25d366]" />
            </div>
          )}

          <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-8 text-center sm:px-10">
            <audio
              ref={remoteAudioRef}
              autoPlay
              controls={audioNeedsGesture}
              className={audioNeedsGesture ? "mt-5 max-w-full" : "sr-only"}
              aria-label="Audio call"
            />
            <div
              className={`call-avatar grid h-24 w-24 place-items-center rounded-full text-2xl font-black ${
                phase === "connected"
                  ? "is-connected"
                  : phase === "incoming"
                    ? "is-ringing"
                    : phase === "calling"
                      ? "is-calling"
                      : ""
              }`}
              aria-hidden="true"
            >
              {initials}
            </div>
            <h2 className="mt-5 text-xl font-bold">{participant}</h2>
            <p className={`mt-1 text-sm ${phase === "incoming" ? "font-bold text-[#25d366]" : "text-muted"}`} aria-live="polite">
              {producerStatusCopy[phase]}
            </p>
            {call && phase !== "idle" && <p className="mt-2 font-mono text-[11px] text-muted">Call #{call.id}</p>}

            {error && (
              <p role="alert" className="mt-5 max-w-md rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
              {isIncomingRinging && (
                <>
                  <button
                    type="button"
                    className="call-accept-animated"
                    onClick={() => void answerCall("accept")}
                    disabled={busy}
                  >
                    <span className="call-btn-icon">
                      <PhoneIcon className="h-5 w-5 animate-phone-ring" />
                    </span>
                    <span>{busy ? "Connecting…" : "Accept call"}</span>
                  </button>
                  <button
                    type="button"
                    className="call-decline-animated"
                    onClick={() => void answerCall("decline")}
                    disabled={busy}
                  >
                    <span className="call-btn-icon">
                      <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                    </span>
                    <span>Decline</span>
                  </button>
                </>
              )}

              {isOutgoingRinging && (
                <button
                  type="button"
                  className="call-decline-animated"
                  onClick={() => void endCall()}
                  disabled={busy}
                >
                  <span className="call-btn-icon">
                    <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                  </span>
                  <span>Cancel call</span>
                </button>
              )}

              {call?.status === "accepted" && (
                <>
                  <button type="button" className="btn-ghost" onClick={toggleMute} disabled={busy} aria-pressed={muted}>
                    <MicIcon className="h-4 w-4" /> {muted ? "Unmute" : "Mute"}
                  </button>
                  <button type="button" className="call-decline-animated" onClick={() => void endCall()} disabled={busy}>
                    <span className="call-btn-icon">
                      <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                    </span>
                    <span>Hang up</span>
                  </button>
                </>
              )}

              {call && !ACTIVE_STATUSES.includes(call.status) && (
                <button type="button" className="btn-ghost" onClick={returnToWaiting}>
                  Wait for another call
                </button>
              )}
            </div>

            {(!call || !ACTIVE_STATUSES.includes(call.status)) && (
              <div className="mt-8 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">Call an Artist · Registered Accounts</p>
                  <span className="badge-acid">{artists.length} {artists.length === 1 ? "account" : "accounts"}</span>
                </div>
                {artists.length === 0 ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    No artists have registered an account yet. Once an artist creates an account on the site, they will appear here so you can call them directly.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label htmlFor="producer-artist-select" className="label">
                        Choose artist account to call
                      </label>
                      <select
                        id="producer-artist-select"
                        value={selectedArtistId ?? ""}
                        onChange={(e) => setSelectedArtistId(Number(e.target.value) || null)}
                        className="field"
                      >
                        {artists.map((artistItem) => (
                          <option key={artistItem.id} value={artistItem.id}>
                            {artistItem.name} ({artistItem.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-muted">
                        Rings {selectedArtist?.name ?? "the selected artist"} directly in their browser when they are signed in.
                      </p>
                      <button
                        type="button"
                        className="call-accept-animated !px-5 !py-2.5 !text-xs"
                        disabled={busy || !selectedArtistId}
                        onClick={() => void startCall(selectedArtistId ?? undefined)}
                      >
                        <span className="call-btn-icon !h-7 !w-7">
                          <PhoneIcon className="h-4 w-4 animate-phone-ring" />
                        </span>
                        <span>
                          {busy ? "Calling…" : `Call ${selectedArtist?.name.split(" ")[0] ?? "Artist"}`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">Live Recording Studio · Producer Access</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    liveRecordingOpen
                      ? "bg-[#25d366]/25 text-[#39dc78]"
                      : "border border-amber-400/40 bg-amber-400/15 text-amber-300"
                  }`}
                >
                  {liveRecordingOpen ? "Open to artists" : "Coming soon (Locked)"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {liveRecordingOpen
                  ? "Live Recording is currently open to artists. You can close it back to 'Coming soon' or enter the producer recording booth."
                  : "Artists currently see 'Coming soon' for Live Recording. You have full producer access and can open it whenever you want."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Link href="/admin/live-recording" className="btn-primary !px-4 !py-2 !text-xs">
                  <MicIcon className="h-3.5 w-3.5" />
                  Open Producer Booth
                </Link>
                <button
                  type="button"
                  disabled={togglingLiveRec}
                  onClick={() => void toggleLiveRecordingAccess(!liveRecordingOpen)}
                  className="btn-ghost !px-4 !py-2 !text-xs"
                >
                  {togglingLiveRec
                    ? "Updating…"
                    : liveRecordingOpen
                      ? "Set to Coming Soon"
                      : "Open Live Recording for Artists"}
                </button>
              </div>
            </div>

            <p className="mt-7 max-w-lg text-xs leading-relaxed text-muted">
              Calls use your browser&apos;s microphone over a secure peer-to-peer audio connection. No video is requested. Keep this window open until the call ends.
            </p>
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ARTIST VIEW: Direct Studio Call experience where the artist can call the
  // producer AND receive incoming calls from the producer when signed in.
  // ---------------------------------------------------------------------------
  const artistStatusCopy: Record<CallPhase, string> = {
    idle: "Studio line ready — tap below to call the producer",
    calling: "Ringing Meetbeatz Producer…",
    incoming: "Incoming studio call from Meetbeatz Producer — ringing now!",
    connecting: "Call answered — connecting studio audio…",
    connected: `Live with Meetbeatz Producer · ${formatDuration(elapsedSeconds)}`,
    ended:
      call?.status === "declined"
        ? callCallerRole === "producer"
          ? "Call declined"
          : "Producer is in a session — call declined"
        : call?.status === "missed"
          ? "No answer — call missed"
          : "Call ended",
    error: "Call needs attention",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <section
        className={`card overflow-hidden p-0 transition-all duration-300 ${
          phase === "incoming"
            ? "ring-2 ring-[#25d366]/80 shadow-[0_0_60px_-10px_rgba(37,211,102,0.45)]"
            : ""
        }`}
      >
        <header className="border-b border-line bg-gradient-to-br from-acid/10 via-transparent to-deep-red/10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-acid shadow-[0_0_8px_var(--color-acid)]" />
              Direct Studio Line · Artist ↔ Producer
            </p>
            <span className="badge-acid">{hasAccount ? "Artist Account · 2-Way Call" : "Artist · Live Voice"}</span>
          </div>
          <h1 className="display mt-3 text-4xl sm:text-5xl">Call Meetbeatz Producer</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Speaking as <span className="font-semibold text-cream">{name}</span>. Connect directly with Meetbeatz over live studio voice to discuss custom beats, exclusive rights, mixing, or studio sessions.
            {hasAccount ? " Since you are signed in to your artist account, the producer can also call you directly." : ""}
          </p>
        </header>

        {isIncomingRinging && (
          <div
            role="alert"
            aria-live="assertive"
            className="incoming-call-banner flex items-center justify-between gap-3 border-b border-[#25d366]/40 bg-[#25d366]/15 px-6 py-3.5 text-sm font-bold text-cream"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25d366] text-ink shadow-lg">
                <PhoneIcon className="h-4 w-4 animate-phone-ring" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#25d366]">Incoming producer call</p>
                <p className="text-sm font-bold text-cream">Meetbeatz Producer is calling you right now</p>
              </div>
            </div>
            <Equalizer className="text-[#25d366]" />
          </div>
        )}

        <div className="flex min-h-[23rem] flex-col items-center justify-center px-6 py-9 text-center sm:px-10">
          <audio
            ref={remoteAudioRef}
            autoPlay
            controls={audioNeedsGesture}
            className={audioNeedsGesture ? "mt-5 max-w-full" : "sr-only"}
            aria-label="Audio call"
          />

          <div
            className={`call-avatar grid h-28 w-28 place-items-center rounded-full text-3xl font-black ${
              phase === "connected"
                ? "is-connected"
                : phase === "incoming"
                  ? "is-ringing"
                  : phase === "calling"
                    ? "is-calling"
                    : ""
            }`}
            aria-hidden="true"
          >
            MB
          </div>

          <h2 className="mt-6 text-2xl font-bold tracking-tight text-cream">Meetbeatz Producer</h2>

          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            {(phase === "calling" || phase === "incoming" || phase === "connected") && (
              <Equalizer className={phase === "incoming" ? "text-[#25d366]" : "text-acid"} />
            )}
            <p className={`text-sm font-medium ${phase === "incoming" ? "font-bold text-[#25d366]" : "text-cream/90"}`} aria-live="polite">
              {artistStatusCopy[phase]}
            </p>
          </div>

          {call && phase !== "idle" && <p className="mt-2 font-mono text-[11px] text-muted">Studio Call #{call.id}</p>}

          {error && (
            <p role="alert" className="mt-5 max-w-md rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {(!call || !ACTIVE_STATUSES.includes(call.status)) && (
              <button
                type="button"
                className="call-accept-animated"
                onClick={() => void startCall()}
                disabled={busy}
              >
                <span className="call-btn-icon">
                  <PhoneIcon className="h-5 w-5 animate-phone-ring" />
                </span>
                <span>
                  {busy
                    ? "Dialing producer…"
                    : call && TERMINAL_STATUSES.includes(call.status)
                      ? "Call Producer Again"
                      : "Call Producer Now"}
                </span>
              </button>
            )}

            {isIncomingRinging && (
              <>
                <button
                  type="button"
                  className="call-accept-animated"
                  onClick={() => void answerCall("accept")}
                  disabled={busy}
                >
                  <span className="call-btn-icon">
                    <PhoneIcon className="h-5 w-5 animate-phone-ring" />
                  </span>
                  <span>{busy ? "Connecting…" : "Accept call"}</span>
                </button>
                <button
                  type="button"
                  className="call-decline-animated"
                  onClick={() => void answerCall("decline")}
                  disabled={busy}
                >
                  <span className="call-btn-icon">
                    <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                  </span>
                  <span>Decline</span>
                </button>
              </>
            )}

            {isOutgoingRinging && (
              <button
                type="button"
                className="call-decline-animated"
                onClick={() => void endCall()}
                disabled={busy}
              >
                <span className="call-btn-icon">
                  <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                </span>
                <span>Cancel call</span>
              </button>
            )}

            {call?.status === "accepted" && (
              <>
                <button type="button" className="btn-ghost" onClick={toggleMute} disabled={busy} aria-pressed={muted}>
                  <MicIcon className="h-4 w-4" /> {muted ? "Unmute mic" : "Mute mic"}
                </button>
                <button
                  type="button"
                  className="call-decline-animated"
                  onClick={() => void endCall()}
                  disabled={busy}
                >
                  <span className="call-btn-icon">
                    <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                  </span>
                  <span>Hang up</span>
                </button>
              </>
            )}
          </div>

          <div className="mt-8 grid max-w-lg grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-[11px] text-muted">
            <div>
              <p className="font-bold text-cream">2-Way Audio</p>
              <p>Artist ↔ Producer</p>
            </div>
            <div className="border-x border-white/10 px-2">
              <p className="font-bold text-cream">No Video</p>
              <p>Voice mic only</p>
            </div>
            <div>
              <p className="font-bold text-cream">Live Ringing</p>
              <p>Instant call alerts</p>
            </div>
          </div>

          <div className="mt-4 flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-xs">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-acid/15 text-acid">
                <MicIcon className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cream">Live Recording Booth</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      liveRecordingOpen
                        ? "bg-[#25d366]/25 text-[#39dc78]"
                        : "border border-amber-400/40 bg-amber-400/15 text-amber-300"
                    }`}
                  >
                    {liveRecordingOpen ? "Open" : "Coming soon"}
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  {liveRecordingOpen
                    ? "Record live vocal takes over Meetbeatz beats in your browser."
                    : "Coming soon — the producer will open the live recording room when ready."}
                </p>
              </div>
            </div>
            <Link href="/live-recording" className="btn-ghost !px-3.5 !py-1.5 !text-xs">
              {liveRecordingOpen ? "Enter Booth →" : "Coming soon"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
