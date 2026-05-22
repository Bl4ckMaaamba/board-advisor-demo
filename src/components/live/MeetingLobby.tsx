"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Mic, MicOff, Smartphone, Loader2, CircleCheck, Hourglass } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LobbyParticipant {
  user_id: string;
  display_name: string;
  mic_tested: boolean;
  joined_at: number;
  online_at: number;
}

interface MeetingLobbyProps {
  meetingId: string;
  /** Meeting title — used in the help text on the QR card. */
  title: string;
}

/**
 * Pre-meeting lobby for in-person multi-mic mode. Shows the join QR code and,
 * via Supabase Realtime presence, the list of participants whose phones are
 * already on the mic page (and whether they've tested their mic). The host
 * sees this on the meeting detail page so they can wait until everyone is
 * ready before clicking "Lancer en live".
 */
export function MeetingLobby({ meetingId, title }: MeetingLobbyProps) {
  const [joinUrl, setJoinUrl] = useState<string>("");
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [connectedToChannel, setConnectedToChannel] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setJoinUrl(`${window.location.origin}/dashboard/meetings/live/${meetingId}/mic`);
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;

    // Host joins the lobby channel as an observer (presence: false). It only
    // listens to other participants' presence — without tracking itself, the
    // host never appears in its own lobby list.
    const channel = supabase.channel(`meeting-lobby-${meetingId}`, {
      config: { presence: { key: "host" } },
    });

    const refresh = () => {
      const state = channel.presenceState<LobbyParticipant>();
      const all: LobbyParticipant[] = [];
      for (const key of Object.keys(state)) {
        if (key === "host") continue;
        const presences = state[key];
        if (presences && presences.length > 0) {
          // Most recent presence per user wins.
          all.push(presences[presences.length - 1]);
        }
      }
      all.sort((a, b) => a.joined_at - b.joined_at);
      setParticipants(all);
    };

    channel
      .on("presence", { event: "sync" }, refresh)
      .on("presence", { event: "join" }, refresh)
      .on("presence", { event: "leave" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectedToChannel(true);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meetingId]);

  const readyCount = useMemo(
    () => participants.filter((p) => p.mic_tested).length,
    [participants]
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Préparer les micros des participants
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {readyCount} / {participants.length} prêts
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        {/* QR */}
        <div className="flex flex-col items-center justify-center text-center">
          {joinUrl ? (
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={joinUrl} size={170} level="M" />
            </div>
          ) : (
            <div className="w-[170px] h-[170px] rounded-xl bg-secondary flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <p className="text-sm font-medium text-foreground mt-4">
            Scannez ce QR code depuis votre téléphone
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
            Chaque participant scanne, autorise son micro et reste sur la page. Quand vous lancez « {title} », tous les micros démarrent automatiquement.
          </p>
        </div>

        {/* Lobby list */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              En attente
            </p>
            {!connectedToChannel && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>

          {participants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <Hourglass className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-foreground font-medium">
                Aucun téléphone connecté
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Demandez à chaque participant de scanner le QR code à gauche.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {participants.map((p) => (
                <li
                  key={p.user_id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                    p.mic_tested
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border bg-secondary/20"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      p.mic_tested ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    {p.mic_tested ? (
                      <Mic className="w-4 h-4 text-white" />
                    ) : (
                      <MicOff className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {p.mic_tested ? (
                        <>
                          <CircleCheck className="w-3 h-3 text-emerald-400" />
                          Micro testé — prêt
                        </>
                      ) : (
                        <>
                          <Hourglass className="w-3 h-3" />
                          Doit tester son micro
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
