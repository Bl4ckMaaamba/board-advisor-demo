"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicStreamer, type MicStatus } from "./mic-streamer";

interface UseMicCaptureOptions {
  meetingId: string | null;
  participantId: string | null;
}

export interface UseMicCaptureReturn {
  status: MicStatus;
  level: number;
  isMuted: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggleMute: () => void;
}

/**
 * React hook wrapper around MicStreamer. The streamer instance is held in
 * a ref so React re-renders never tear down an active mic.
 */
export function useMicCapture({
  meetingId,
  participantId,
}: UseMicCaptureOptions): UseMicCaptureReturn {
  const streamerRef = useRef<MicStreamer | null>(null);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [level, setLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tear the streamer down when the component using the hook unmounts —
  // critical so navigating away releases the mic LED + closes the WS.
  useEffect(() => {
    return () => {
      if (streamerRef.current) {
        streamerRef.current.stop().catch(() => {
          // ignore
        });
        streamerRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (!meetingId || !participantId) {
      setError("meetingId / participantId manquant");
      return;
    }
    if (streamerRef.current) {
      // Already running.
      return;
    }
    setError(null);
    const streamer = new MicStreamer({
      meetingId,
      participantId,
      onStatus: (s) => {
        setStatus(s);
        setIsMuted(s === "muted");
      },
      onLevel: (l) => setLevel(l),
      onError: (err) => setError(err.message),
    });
    streamerRef.current = streamer;
    try {
      await streamer.start();
    } catch (err) {
      streamerRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [meetingId, participantId]);

  const stop = useCallback(async () => {
    const s = streamerRef.current;
    if (!s) return;
    streamerRef.current = null;
    try {
      await s.stop();
    } finally {
      setLevel(0);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const s = streamerRef.current;
    if (!s) return;
    if (s.isMuted()) {
      s.unmute();
    } else {
      s.mute();
    }
  }, []);

  return { status, level, isMuted, error, start, stop, toggleMute };
}
