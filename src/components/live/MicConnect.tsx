"use client";

import { useEffect, useMemo, useRef } from "react";
import { Mic, MicOff, Loader2, AlertCircle, CircleCheck } from "lucide-react";
import { useMicCapture } from "@/lib/live/audio/use-mic-capture";
import type { MicStatus } from "@/lib/live/audio/mic-streamer";

interface MicConnectProps {
  meetingId: string | null;
  /** The authenticated user's id; used as participant_id server-side. */
  participantId: string | null;
  /** Compact variant for embedding in the host's live dashboard. */
  variant?: "default" | "hero";
  /**
   * If true, the streamer is started automatically once meetingId/participantId
   * are available. Used by the participant mic page when the host launches
   * a meeting they were waiting for in the lobby.
   */
  autoStart?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<MicStatus, string> = {
  idle: "Micro non connecté",
  requesting_permission: "Autorisation du micro…",
  joining: "Connexion à la réunion…",
  live: "En direct",
  muted: "Muet",
  reconnecting: "Reconnexion…",
  error: "Erreur",
  stopped: "Déconnecté",
};

export function MicConnect({
  meetingId,
  participantId,
  variant = "default",
  autoStart = false,
  className = "",
}: MicConnectProps) {
  const { status, level, isMuted, error, start, stop, toggleMute } =
    useMicCapture({ meetingId, participantId });

  const isActive = status === "live" || status === "muted" || status === "reconnecting";
  const isStarting = status === "requesting_permission" || status === "joining";

  // Fire start() once when the conditions are met. The ref guard prevents a
  // re-trigger if the streamer briefly drops to "stopped" / "error" — at that
  // point the user clicks the button manually instead of looping forever.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (
      autoStart &&
      meetingId &&
      participantId &&
      !autoStartedRef.current &&
      status === "idle"
    ) {
      autoStartedRef.current = true;
      void start();
    }
  }, [autoStart, meetingId, participantId, status, start]);

  const tone = useMemo(() => statusTone(status), [status]);

  const isHero = variant === "hero";

  return (
    <div
      className={`rounded-2xl border ${tone.border} ${tone.bg} ${
        isHero ? "p-6" : "p-4"
      } ${className}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center rounded-full ${
            isHero ? "w-14 h-14" : "w-10 h-10"
          } ${tone.iconBg}`}
        >
          {isStarting ? (
            <Loader2 className={`${isHero ? "w-7 h-7" : "w-5 h-5"} animate-spin text-white`} />
          ) : isMuted ? (
            <MicOff className={`${isHero ? "w-7 h-7" : "w-5 h-5"} text-white`} />
          ) : status === "error" ? (
            <AlertCircle className={`${isHero ? "w-7 h-7" : "w-5 h-5"} text-white`} />
          ) : isActive ? (
            <Mic className={`${isHero ? "w-7 h-7" : "w-5 h-5"} text-white`} />
          ) : (
            <Mic className={`${isHero ? "w-7 h-7" : "w-5 h-5"} text-muted-foreground`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-foreground ${isHero ? "text-lg" : "text-sm"}`}>
            {STATUS_LABEL[status]}
          </p>
          {error ? (
            <p className="text-xs text-rose-500 mt-0.5 truncate">{error}</p>
          ) : isActive ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Votre voix alimente la transcription et le fact-checking
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Activez votre micro pour rejoindre la réunion
            </p>
          )}
        </div>

        {/* Level meter — visible only when streaming */}
        {isActive && !isMuted && (
          <div className="flex items-end gap-1 h-8">
            {[0.15, 0.35, 0.55, 0.75, 0.92].map((threshold) => (
              <div
                key={threshold}
                className={`w-1 rounded-full transition-colors ${
                  level > threshold ? "bg-emerald-400" : "bg-muted-foreground/20"
                }`}
                style={{
                  height: `${Math.max(8, threshold * 32)}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className={`flex items-center gap-2 ${isHero ? "mt-6" : "mt-4"}`}>
        {!isActive ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={isStarting || !meetingId || !participantId}
            className={`flex-1 ${
              isHero ? "py-4 text-base" : "py-2.5 text-sm"
            } rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion…
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Activer mon micro
              </>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`flex-1 ${
                isHero ? "py-4 text-base" : "py-2.5 text-sm"
              } rounded-xl border border-border font-semibold text-foreground hover:bg-secondary/60 transition-colors flex items-center justify-center gap-2`}
            >
              {isMuted ? (
                <>
                  <Mic className="w-4 h-4" />
                  Reprendre
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4" />
                  Couper
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void stop()}
              className={`flex-1 ${
                isHero ? "py-4 text-base" : "py-2.5 text-sm"
              } rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-500/90 transition-colors flex items-center justify-center gap-2`}
            >
              Déconnecter
            </button>
          </>
        )}
      </div>

      {status === "live" && !isMuted && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
          <CircleCheck className="w-3.5 h-3.5" />
          <span>Audio relayé en direct vers la transcription</span>
        </div>
      )}
    </div>
  );
}

function statusTone(status: MicStatus): {
  border: string;
  bg: string;
  iconBg: string;
} {
  switch (status) {
    case "live":
      return {
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/5",
        iconBg: "bg-emerald-500",
      };
    case "muted":
      return {
        border: "border-amber-500/30",
        bg: "bg-amber-500/5",
        iconBg: "bg-amber-500",
      };
    case "reconnecting":
      return {
        border: "border-amber-500/30",
        bg: "bg-amber-500/5",
        iconBg: "bg-amber-500",
      };
    case "error":
      return {
        border: "border-rose-500/30",
        bg: "bg-rose-500/5",
        iconBg: "bg-rose-500",
      };
    case "requesting_permission":
    case "joining":
      return {
        border: "border-primary/30",
        bg: "bg-primary/5",
        iconBg: "bg-primary",
      };
    default:
      return {
        border: "border-border",
        bg: "bg-card",
        iconBg: "bg-secondary",
      };
  }
}
