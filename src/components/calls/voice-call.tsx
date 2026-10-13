"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicIcon, PhoneIcon } from "@/components/icons";

type CallRole = "artist" | "producer";
type CallStatus = "ringing" | "accepted" | "missed" | "declined" | "cancelled" | "ended";
type CallPhase = "idle" | "calling" | "incoming" | "connecting" | "connected" | "ended" | "error";
type SignalKind = "offer" | "answer" | "ice-candidate";

type VoiceCall = {
  id: number;
  customerId: number;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
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
  call: VoiceCall | null;
  customerName?: string | null;
  signals?: CallSignal[];
  error?: string;
};

type CallAction = {
  action: "start" | "accept" | "decline" | "cancel" | "end" | "signal";
  callId?: number;
  kind?: SignalKind;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit;
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

export function VoiceCall({ role, name }: { role: CallRole; name: string }) {
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef<VoiceCall | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerCallIdRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSignalIdRef = useRef(0);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const offerStartedCallRef = useRef<number | null>(null);
  const pollingRef = useRef(false);

  const updateCall = useCallback((next: VoiceCall | null) => {
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

  const postAction = useCallback(async (body: CallAction): Promise<CallsResponse> => {
    const response = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as CallsResponse;
    if (!response.ok) throw new Error(data.error ?? "Could not update the call.");
    return data;
  }, []);

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
        const configResponse = await fetch("/api/calls/ice-config", { cache: "no-store" });
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
        void remoteAudioRef.current.play().then(() => setAudioNeedsGesture(false)).catch(() => {
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
    [cleanupPeer, postAction, updatePhase],
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
      const shouldFollowCurrent = !!current && (role === "artist" || ACTIVE_STATUSES.includes(current.status));
      const query = new URLSearchParams();
      if (shouldFollowCurrent && current) query.set("callId", String(current.id));
      query.set("after", String(shouldFollowCurrent ? lastSignalIdRef.current : 0));
      const response = await fetch(`/api/calls?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as CallsResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not check the call.");

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

      if (data.call.status === "ringing") {
        updatePhase(role === "producer" ? "incoming" : "calling");
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
  }, [cleanupPeer, createArtistOffer, handleSignal, isCallAccepted, role, updateCall, updatePhase]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    const current = call;
    if (!current || !ACTIVE_STATUSES.includes(current.status)) return;
    const onPageHide = () => {
      const action = current.status === "ringing" ? (role === "artist" ? "cancel" : "decline") : "end";
      const payload = new Blob([JSON.stringify({ action, callId: current.id })], { type: "application/json" });
      navigator.sendBeacon("/api/calls", payload);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [call, role]);

  async function startCall() {
    setBusy(true);
    setError(null);
    lastSignalIdRef.current = 0;
    cleanupPeer();
    try {
      const result = await postAction({ action: "start" });
      if (!result.call) throw new Error("Could not start the call.");
      updateCall(result.call);
      setRemoteName("Meetbeatz Producer");
      updatePhase(result.call.status === "accepted" ? "connecting" : "calling");
    } catch (callError) {
      setError(messageForError(callError));
      updatePhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function answerCall(action: "accept" | "decline") {
    if (!call) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postAction({ action, callId: call.id });
      if (result.call) updateCall(result.call);
      if (action === "accept") updatePhase("connecting");
      else {
        cleanupPeer();
        updatePhase("ended");
      }
    } catch (callError) {
      setError(messageForError(callError));
    } finally {
      setBusy(false);
    }
  }

  async function endCall() {
    if (!call) return;
    setBusy(true);
    setError(null);
    const action = call.status === "ringing" ? (role === "artist" ? "cancel" : "decline") : "end";
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

  const participant = role === "artist" ? "Meetbeatz Producer" : remoteName ?? "Artist";
  const statusCopy: Record<CallPhase, string> = {
    idle: role === "artist" ? "Ready when you are." : "Waiting for an artist to call.",
    calling: "Calling the producer…",
    incoming: "Incoming artist audio call",
    connecting: "Connecting audio…",
    connected: "Call connected",
    ended: "Call ended",
    error: "Call needs attention",
  };
  const initials = participant.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="card overflow-hidden p-0">
        <header className="border-b border-line p-6 sm:p-8">
          <p className="eyebrow">Private · artist ↔ producer</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="display text-4xl sm:text-5xl">Audio call</h1>
            <span className="badge">{role === "artist" ? "Artist" : "Producer"}</span>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Signed in as <span className="text-cream/80">{name}</span>. {role === "artist" ? "Start a private, audio-only call with the producer." : "Leave this window open to receive private audio calls from artists."} Your browser will ask for microphone access when the call is answered.
          </p>
        </header>

        <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-8 text-center sm:px-10">
          <audio
            ref={remoteAudioRef}
            autoPlay
            controls={audioNeedsGesture}
            className={audioNeedsGesture ? "mt-5 max-w-full" : "sr-only"}
            aria-label="Audio call"
          />
          <div className={`call-avatar grid h-24 w-24 place-items-center rounded-full text-2xl font-black ${phase === "connected" ? "is-connected" : ""}`} aria-hidden="true">
            {initials || "MB"}
          </div>
          <h2 className="mt-5 text-xl font-bold">{participant}</h2>
          <p className="mt-1 text-sm text-muted" aria-live="polite">{call?.status === "missed" ? "No answer — call missed" : statusCopy[phase]}</p>
          {call && phase !== "idle" && <p className="mt-2 font-mono text-[11px] text-muted">Call #{call.id}</p>}

          {error && <p role="alert" className="mt-5 max-w-md rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {role === "artist" && (!call || !ACTIVE_STATUSES.includes(call.status)) && (
              <button type="button" className="call-start-button" onClick={() => void startCall()} disabled={busy}>
                <PhoneIcon className="h-5 w-5" />
                {busy ? "Starting…" : call && TERMINAL_STATUSES.includes(call.status) ? "Call again" : "Start audio call"}
              </button>
            )}
            {role === "producer" && call?.status === "ringing" && (
              <>
                <button type="button" className="call-start-button" onClick={() => void answerCall("accept")} disabled={busy}>
                  <PhoneIcon className="h-5 w-5" />
                  {busy ? "Connecting…" : "Accept call"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => void answerCall("decline")} disabled={busy}>
                  Decline
                </button>
              </>
            )}
            {call?.status === "ringing" && role === "artist" && (
              <button type="button" className="btn-ghost" onClick={() => void endCall()} disabled={busy}>
                Cancel call
              </button>
            )}
            {call?.status === "accepted" && (
              <>
                <button type="button" className="btn-ghost" onClick={toggleMute} disabled={busy} aria-pressed={muted}>
                  <MicIcon className="h-4 w-4" /> {muted ? "Unmute" : "Mute"}
                </button>
                <button type="button" className="call-end-button" onClick={() => void endCall()} disabled={busy}>
                  <PhoneIcon className="h-5 w-5 rotate-[135deg]" />
                  Hang up
                </button>
              </>
            )}
            {role === "producer" && call && !ACTIVE_STATUSES.includes(call.status) && (
              <button type="button" className="btn-ghost" onClick={returnToWaiting}>
                Wait for another call
              </button>
            )}
          </div>

          <p className="mt-7 max-w-lg text-xs leading-relaxed text-muted">
            Calls use your browser&apos;s microphone over a secure peer-to-peer audio connection. No video is requested. Keep this window open until the call ends.
          </p>
        </div>
      </section>
    </div>
  );
}
