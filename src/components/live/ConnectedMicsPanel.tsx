"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Mic, MicOff, Users, Wifi, WifiOff } from "lucide-react";
import { MicConnect } from "./MicConnect";

interface ConnectedMic {
  participant_id: string;
  display_name: string;
  joined_at: number;
  total_chunks: number;
  dropped_chunks: number;
  is_connected: boolean;
}

interface ConnectedMicsPanelProps {
  meetingId: string | null;
  /** The host's own auth user id — used as participant_id for their own mic. */
  currentUserId: string | null;
}

export function ConnectedMicsPanel({
  meetingId,
  currentUserId,
}: ConnectedMicsPanelProps) {
  const [mics, setMics] = useState<ConnectedMic[]>([]);
  const [joinUrl, setJoinUrl] = useState<string>("");

  useEffect(() => {
    if (!meetingId || typeof window === "undefined") return;
    const origin = window.location.origin;
    setJoinUrl(`${origin}/dashboard/meetings/live/${meetingId}/mic`);
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/live/status?meeting_id=${meetingId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.connected_mics)) {
          setMics(data.connected_mics);
        }
      } catch {
        // silent
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [meetingId]);

  if (!meetingId) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Micros connectés
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {mics.length} {mics.length > 1 ? "participants" : "participant"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        {/* Host's own mic */}
        <div className="lg:col-span-1">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            Votre micro
          </p>
          <MicConnect
            meetingId={meetingId}
            participantId={currentUserId}
            variant="default"
          />
        </div>

        {/* QR code for other participants */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center rounded-xl border border-border bg-secondary/20 p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
            Scanner pour rejoindre
          </p>
          {joinUrl ? (
            <div className="bg-white p-2 rounded-lg">
              <QRCodeSVG value={joinUrl} size={120} level="M" />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground mt-3 text-center max-w-[180px]">
            Chaque participant scanne ce QR pour activer son micro depuis son téléphone.
          </p>
        </div>

        {/* List of connected mics */}
        <div className="lg:col-span-1">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            En direct ({mics.length})
          </p>
          {mics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <MicOff className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">
                Aucun micro connecté pour le moment
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {mics.map((m) => (
                <li
                  key={m.participant_id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-secondary/20"
                >
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full ${
                      m.is_connected ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {m.is_connected ? (
                        <>
                          <Wifi className="w-3 h-3 text-emerald-400" />
                          {formatJoinedFor(m.joined_at)}
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3 h-3 text-rose-400" />
                          Déconnecté
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatJoinedFor(joinedAt: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - joinedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}
