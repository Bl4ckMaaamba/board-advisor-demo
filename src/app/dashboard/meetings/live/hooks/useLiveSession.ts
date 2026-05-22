"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type SessionStatus = "idle" | "recording" | "paused" | "completed" | "error";
export type MeetingMode = "in_person" | "visio";

interface SessionMetrics {
  total_chunks: number;
  total_segments: number;
  total_claims: number;
  total_factchecks: number;
  total_moderations: number;
  total_suggestions: number;
  avg_latency_ms: number;
  session_duration_s: number;
}

interface UseLiveSessionReturn {
  meetingId: string | null;
  status: SessionStatus;
  metrics: SessionMetrics | null;
  error: string | null;
  recallBotStatus: string | null;
  expertId: string | null;
  start: (title: string, boardId?: string, existingMeetingId?: string) => Promise<void>;
  startVisio: (meetingId: string) => Promise<void>;
  resumeVisio: (meetingId: string) => void;
  stop: () => Promise<void>;
  isRecording: boolean;
  mode: MeetingMode;
}

/**
 * Manages the lifecycle of a live meeting session: creates / stops the
 * server-side session and polls metrics. Microphone capture is handled
 * separately by MicConnect / useMicCapture so each participant can stream
 * from their own device.
 */
export function useLiveSession(): UseLiveSessionReturn {
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MeetingMode>("in_person");
  const [recallBotStatus, setRecallBotStatus] = useState<string | null>(null);
  const [expertId, setExpertId] = useState<string | null>(null);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll status for metrics
  useEffect(() => {
    if (!meetingId || status !== "recording") return;

    statusPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/status?meeting_id=${meetingId}`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(data.metrics);
        }
      } catch {
        // Silent fail for status polling
      }
    }, 3000);

    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [meetingId, status]);

  // Poll bot status for visio mode
  useEffect(() => {
    if (!meetingId || mode !== "visio" || status !== "recording") return;

    botPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/bot-status/${meetingId}`);
        if (res.ok) {
          const data = await res.json();
          setRecallBotStatus(data.recall_bot_status);
        }
      } catch {
        // Silent fail
      }
    }, 5000);

    return () => {
      if (botPollRef.current) clearInterval(botPollRef.current);
    };
  }, [meetingId, mode, status]);

  // Start in-person session — server-side only, no mic capture here.
  // Each participant attaches their own mic via MicConnect afterwards.
  const start = useCallback(
    async (title: string, boardId?: string, existingMeetingId?: string) => {
      try {
        setError(null);
        setStatus("recording");
        setMode("in_person");

        const res = await fetch("/api/live/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            ...(boardId ? { board_id: boardId } : {}),
            ...(existingMeetingId ? { existing_meeting_id: existingMeetingId } : {}),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to start session");
        }

        const { meeting_id, expert_id } = await res.json();
        if (expert_id) setExpertId(expert_id);
        setMeetingId(meeting_id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start";
        setError(message);
        setStatus("error");
      }
    },
    []
  );

  // Resume an already-running visio session (after page refresh)
  const resumeVisio = useCallback((existingMeetingId: string) => {
    setMeetingId(existingMeetingId);
    setStatus("recording");
    setMode("visio");
    setError(null);
  }, []);

  // Start visio session (Recall.ai bot — no microphone)
  const startVisio = useCallback(async (existingMeetingId: string) => {
    try {
      setError(null);
      setStatus("recording");
      setMode("visio");
      setMeetingId(existingMeetingId);

      const res = await fetch("/api/live/start-visio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: existingMeetingId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start visio session");
      }

      const data = await res.json();
      setRecallBotStatus(data.status || "joining");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start visio";
      setError(message);
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      if (botPollRef.current) {
        clearInterval(botPollRef.current);
        botPollRef.current = null;
      }

      if (meetingId) {
        const endpoint = mode === "visio" ? "/api/live/stop-visio" : "/api/live/stop";
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meeting_id: meetingId }),
        });
      }

      setStatus("completed");
      setRecallBotStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop";
      setError(message);
    }
  }, [meetingId, mode]);

  return {
    meetingId,
    status,
    metrics,
    error,
    recallBotStatus,
    expertId,
    start,
    startVisio,
    resumeVisio,
    stop,
    isRecording: status === "recording",
    mode,
  };
}
