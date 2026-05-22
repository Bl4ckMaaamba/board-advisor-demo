"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Radio,
  Mic,
  Hourglass,
  CircleCheck,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MicConnect } from "@/components/live/MicConnect";

interface MeetingInfo {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
}

interface ProfileInfo {
  id: string;
  full_name: string | null;
}

type LobbyState = "loading" | "lobby" | "live" | "error";

/**
 * Mobile-first page that a participant opens by scanning the host's QR code.
 *
 * Two-stage flow:
 *   1. Lobby — meeting not yet started. The participant taps "Tester mon micro"
 *      which prompts the browser permission and updates their presence so the
 *      host sees them as ready. No audio is streamed yet.
 *   2. Live — the host has launched the session. The page detects the status
 *      change (poll every 2.5 s) and auto-mounts MicConnect, which immediately
 *      activates the streamer thanks to the autoStart prop.
 */
export default function ParticipantMicPage() {
  const params = useParams();
  const meetingId = typeof params.meetingId === "string" ? params.meetingId : null;

  const [stage, setStage] = useState<LobbyState>("loading");
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micTested, setMicTested] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinedAtRef = useRef<number>(Date.now());

  // ─── Bootstrap: auth + fetch meeting + profile ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!meetingId) {
        setError("Lien invalide");
        setStage("error");
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = `/login?next=${encodeURIComponent(
            `/dashboard/meetings/live/${meetingId}/mic`
          )}`;
          return;
        }

        const [meetingRes, profileRes] = await Promise.all([
          supabase
            .from("meetings")
            .select("id, title, status, scheduled_at")
            .eq("id", meetingId)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (meetingRes.error || !meetingRes.data) {
          setError("Réunion introuvable ou accès refusé");
          setStage("error");
          return;
        }

        setMeeting(meetingRes.data);
        setProfile(profileRes.data ?? { id: user.id, full_name: null });
        setStage(meetingRes.data.status === "recording" ? "live" : "lobby");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur de chargement");
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // ─── Lobby presence + auto-detect session start ───
  useEffect(() => {
    if (stage !== "lobby" || !meeting || !profile) return;

    const channel = supabase.channel(`meeting-lobby-${meeting.id}`, {
      config: { presence: { key: profile.id } },
    });
    channelRef.current = channel;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: profile.id,
          display_name: profile.full_name?.trim() || "Participant",
          mic_tested: false,
          joined_at: joinedAtRef.current,
          online_at: Date.now(),
        });
      }
    });

    // Poll meeting status; transition to "live" the moment the host starts.
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("meetings")
        .select("status")
        .eq("id", meeting.id)
        .maybeSingle();
      if (data?.status === "recording") {
        setStage("live");
      }
    }, 2500);

    return () => {
      clearInterval(poll);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [stage, meeting, profile]);

  // ─── Update presence when mic_tested flips ───
  useEffect(() => {
    if (stage !== "lobby" || !channelRef.current || !profile) return;
    void channelRef.current.track({
      user_id: profile.id,
      display_name: profile.full_name?.trim() || "Participant",
      mic_tested: micTested,
      joined_at: joinedAtRef.current,
      online_at: Date.now(),
    });
  }, [micTested, stage, profile]);

  // Mic test: just request permission and immediately release the stream.
  // Confirms to the participant their browser will let them through, and
  // updates the host's lobby panel.
  const handleTestMic = async () => {
    setTestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Hold the mic for ~1.5 s so the user sees a clear signal and the OS
      // shows the recording indicator, then release. We don't stream yet.
      await new Promise((r) => setTimeout(r, 1500));
      stream.getTracks().forEach((t) => t.stop());
      setMicTested(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'accéder au micro. Autorisez l'accès dans les réglages du navigateur."
      );
    } finally {
      setTestingMic(false);
    }
  };

  if (stage === "loading") {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === "error" || !meeting || !profile) {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4">
          <Radio className="w-7 h-7 text-rose-400" />
        </div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          Connexion impossible
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          {error ?? "Cette réunion n'existe pas ou vous n'y êtes pas invité."}
        </p>
        <Link
          href="/dashboard/meetings"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux réunions
        </Link>
      </div>
    );
  }

  const displayName = profile.full_name?.trim() || "Participant";

  // ─── Live mode — auto-stream as soon as we mount MicConnect ───
  if (stage === "live") {
    return (
      <div className="min-h-[100svh] flex flex-col bg-background p-6">
        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
          <div className="w-full text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
              </span>
              Réunion en cours
            </div>
            <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
              {meeting.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Bonjour {displayName}, activez votre micro pour participer.
            </p>
          </div>

          <MicConnect
            meetingId={meeting.id}
            participantId={profile.id}
            variant="hero"
            autoStart={micTested}
            className="w-full"
          />

          <p className="text-xs text-muted-foreground text-center mt-6 max-w-xs">
            Gardez cette page ouverte pendant la réunion. Si vous fermez l&apos;onglet, votre micro sera déconnecté.
          </p>
        </div>
      </div>
    );
  }

  // ─── Lobby mode — meeting not yet started ───
  return (
    <div className="min-h-[100svh] flex flex-col bg-background p-6">
      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        <div className="w-full text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
            <Hourglass className="w-3 h-3" />
            En attente du démarrage
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
            {meeting.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Bonjour {displayName}. Préparez votre micro — il s&apos;activera automatiquement quand l&apos;animateur lance la réunion.
          </p>
        </div>

        <div
          className={`w-full rounded-2xl border p-6 ${
            micTested
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                micTested ? "bg-emerald-500" : "bg-secondary"
              }`}
            >
              {testingMic ? (
                <Loader2 className="w-7 h-7 animate-spin text-white" />
              ) : (
                <Mic
                  className={`w-7 h-7 ${
                    micTested ? "text-white" : "text-muted-foreground"
                  }`}
                />
              )}
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold text-foreground">
                {micTested ? "Micro prêt" : "Micro non testé"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {micTested
                  ? "L'animateur vous voit comme prêt"
                  : "Touchez le bouton pour autoriser l'accès"}
              </p>
            </div>
          </div>

          {!micTested ? (
            <button
              type="button"
              onClick={handleTestMic}
              disabled={testingMic}
              className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {testingMic ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Test du micro…
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Tester mon micro
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              <CircleCheck className="w-4 h-4" />
              Tout est bon — restez sur cette page
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6 max-w-xs">
          Votre voix ne sera transmise qu&apos;une fois la réunion démarrée par l&apos;animateur.
        </p>
      </div>
    </div>
  );
}
