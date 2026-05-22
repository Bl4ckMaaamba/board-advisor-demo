"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Radio, Shield, Lightbulb, Users, Mic, CheckCircle2, ArrowRight, Brain, Sparkles } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useBoardContext } from "@/lib/board-context";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { supabase } from "@/lib/supabase";
import { ConnectedMicsPanel } from "@/components/live/ConnectedMicsPanel";
import { useLiveSession } from "./hooks/useLiveSession";
import { useRealtimeTranscription } from "./hooks/useRealtimeTranscription";
import { useRealtimeFactChecks } from "./hooks/useRealtimeFactChecks";
import { useRealtimeModeration } from "./hooks/useRealtimeModeration";
import { useRealtimeSuggestions } from "./hooks/useRealtimeSuggestions";
import { useRealtimeExpertInsights } from "./hooks/useRealtimeExpertInsights";
import { useRealtimeBlindSpots, type BlindSpotEntry } from "./hooks/useRealtimeBlindSpots";
import { LiveMeetingControls } from "./components/LiveMeetingControls";
import { TranscriptionFeed } from "./components/TranscriptionFeed";
import { FactCheckPanel } from "./components/FactCheckPanel";
import { ModerationAlerts } from "./components/ModerationAlerts";
import { SuggestionsPanel } from "./components/SuggestionsPanel";
import { ExpertPanel } from "./components/ExpertPanel";
import { BlindSpotsPanel } from "./components/BlindSpotsPanel";
import { BlindSpotPopup } from "./components/BlindSpotPopup";
import { SpeakerStats } from "./components/SpeakerStats";
import { LatencyIndicator } from "./components/LatencyIndicator";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function LiveMeetingPage() {
  return (
    <Suspense fallback={null}>
      <LiveMeetingContent />
    </Suspense>
  );
}

function LiveMeetingContent() {
  const searchParams = useSearchParams();
  const titleParam = searchParams.get("title");
  const { selectedBoardData } = useBoardContext();
  const session = useLiveSession();
  const transcriptions = useRealtimeTranscription(session.meetingId);
  const factChecks = useRealtimeFactChecks(session.meetingId);
  const moderations = useRealtimeModeration(session.meetingId);
  const suggestions = useRealtimeSuggestions(session.meetingId);
  const expertInsights = useRealtimeExpertInsights(session.meetingId);
  const blindSpots = useRealtimeBlindSpots(session.meetingId);
  const [requestingInsight, setRequestingInsight] = useState(false);
  const [requestingBlindSpot, setRequestingBlindSpot] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setCurrentUserId(user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const meetingIdParam = searchParams.get("meeting_id") ?? undefined;

  const handleStart = useCallback(
    async (title: string) => {
      if (!meetingIdParam) {
        console.warn("[live] No meeting_id in URL — starting without existing meeting. Agenda and documents may be unavailable.");
      }
      await session.start(title, selectedBoardData?.id, meetingIdParam);
    },
    [session, selectedBoardData?.id, meetingIdParam]
  );

  const handleRequestInsight = useCallback(async (expertId: string, question?: string) => {
    if (!session.meetingId || requestingInsight) return;
    setRequestingInsight(true);
    try {
      await fetch(`/api/meetings/${session.meetingId}/expert-panel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expert_id: expertId, user_question: question }),
      });
    } catch {
      // silent
    } finally {
      setRequestingInsight(false);
    }
  }, [session.meetingId, requestingInsight]);

  const handleRequestBlindSpot = useCallback(async () => {
    if (!session.meetingId || requestingBlindSpot) return;
    const query = window.prompt(
      "Sur quel thème ou question voulez-vous une analyse d'angle mort ?\n\n(Laisser vide pour une analyse sur la discussion en cours)"
    );
    if (query === null) return; // user cancelled
    setRequestingBlindSpot(true);
    try {
      await fetch(`/api/meetings/${session.meetingId}/blind-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_query: query.trim() || undefined }),
      });
    } catch {
      // silent
    } finally {
      setRequestingBlindSpot(false);
    }
  }, [session.meetingId, requestingBlindSpot]);

  const handleSourceClick = useCallback((spot: BlindSpotEntry) => {
    const ref = spot.source_reference;
    if (spot.source_type === "web" && ref && "url" in ref) {
      window.open(ref.url, "_blank", "noopener,noreferrer");
    }
    // Pour 'document' et 'meeting_history' on pourra ouvrir un modal en V2
  }, []);

  const isActive = session.status === "recording" || session.status === "completed";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="h-[calc(100vh-9rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6 shrink-0">
        <Link
          href="/dashboard/meetings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux reunions
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
              Reunion en direct
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Transcription, fact-checking et moderation en temps reel
            </p>
          </div>

          <div className="flex items-center gap-4">
            <LatencyIndicator
              avgLatencyMs={session.metrics?.avg_latency_ms ?? 0}
              isRecording={session.isRecording}
            />
            <LiveMeetingControls
              status={session.status}
              onStart={handleStart}
              onStop={session.stop}
              error={session.error}
              initialTitle={titleParam ? decodeURIComponent(titleParam) : undefined}
            />
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      {!isActive ? (
        /* Empty state */
        <motion.div variants={fadeUp} className="flex-1">
          <SpotlightCard className="rounded-2xl border border-border bg-card">
            <div className="p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-6">
                <Radio className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground mb-2">
                Aucune reunion en cours
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
                Entrez un titre et demarrez l&apos;enregistrement. La transcription, le fact-checking et la moderation s&apos;activeront en temps reel.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl">
                {[
                  {
                    icon: Mic,
                    title: "Transcription IA",
                    desc: "Voxtral convertit la parole en texte avec identification des intervenants",
                  },
                  {
                    icon: Shield,
                    title: "Fact-checking",
                    desc: "Verification automatique des chiffres et affirmations via 10 sources",
                  },
                  {
                    icon: Lightbulb,
                    title: "Suggestions",
                    desc: "Points a approfondir, questions et actions generees en temps reel",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="p-4 rounded-xl border border-border bg-secondary/20"
                  >
                    <feature.icon className="w-5 h-5 text-primary mb-2" />
                    <p className="text-sm font-medium text-foreground mb-0.5">
                      {feature.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      ) : (
        /* Active meeting dashboard */
        <motion.div variants={fadeUp} className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Connected mics + QR code (in-person only) */}
        {session.mode === "in_person" && (
          <ConnectedMicsPanel
            meetingId={session.meetingId}
            currentUserId={currentUserId}
          />
        )}
        <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">
          {/* Left: Transcription (3/5) */}
          <div className="col-span-3 flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
              <Mic className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Transcription</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {transcriptions.length} segments
              </span>
            </div>
            <div className="flex-1 p-3 flex flex-col min-h-0">
              <TranscriptionFeed
                transcriptions={transcriptions}
                isRecording={session.isRecording}
              />
            </div>
            {/* Speaker stats footer */}
            <div className="px-4 py-2.5 border-t border-border shrink-0">
              <SpeakerStats transcriptions={transcriptions} />
            </div>
          </div>

          {/* Right: Panels (2/5) */}
          <div className="col-span-2 flex flex-col gap-4 min-h-0 overflow-y-auto">
            {/* Fact-check panel */}
            <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-foreground">Fact-checking</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {factChecks.length} verifications
                </span>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <FactCheckPanel factChecks={factChecks} />
              </div>
            </div>

            {/* Moderation panel */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-foreground">Moderation</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {moderations.length} alertes
                </span>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <ModerationAlerts moderations={moderations} />
              </div>
            </div>

            {/* Suggestions panel */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Lightbulb className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-foreground">Suggestions</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {suggestions.length}
                </span>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <SuggestionsPanel suggestions={suggestions} />
              </div>
            </div>

            {/* Expert panel */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Brain className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-foreground">Panel Expert</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {expertInsights.length}
                </span>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <ExpertPanel
                  insights={expertInsights}
                  meetingId={session.meetingId}
                  onRequestExpert={handleRequestInsight}
                  isRequesting={requestingInsight}
                />
              </div>
            </div>

            {/* Blind spots panel */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <span className="text-sm font-semibold text-foreground">Angles morts</span>
                {blindSpots.some((s) => s.severity === "critical") && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-500">
                    Critique
                  </span>
                )}
                <span className={`text-xs ml-auto ${blindSpots.length > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {blindSpots.length}
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <BlindSpotsPanel
                  spots={blindSpots}
                  meetingId={session.meetingId}
                  onRequestManual={handleRequestBlindSpot}
                  onSourceClick={handleSourceClick}
                  isManualLoading={requestingBlindSpot}
                />
              </div>
            </div>
          </div>
        </div>
        </motion.div>
      )}

      {/* Pop-up éphémère pour nouveaux angles morts */}
      {isActive && <BlindSpotPopup spots={blindSpots} onSourceClick={handleSourceClick} />}

      {/* Metrics bar when active */}
      {isActive && session.metrics && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 shrink-0 flex items-center justify-between text-xs text-muted-foreground px-1"
        >
          <span>
            {Math.round(session.metrics.session_duration_s / 60)}min{" "}
            {Math.round(session.metrics.session_duration_s % 60)}s
          </span>
          <div className="flex items-center gap-4">
            <span>{session.metrics.total_chunks} chunks</span>
            <span>{session.metrics.total_segments} segments</span>
            <span>{session.metrics.total_claims} claims</span>
            <span>{session.metrics.total_factchecks} fact-checks</span>
          </div>
        </motion.div>
      )}

      {/* Post-meeting actions when completed */}
      {session.status === "completed" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 shrink-0"
        >
          <div className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Réunion terminée</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {transcriptions.length} segments transcrits, {factChecks.length} vérifications
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/meetings/history"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-secondary/50 transition-colors"
              >
                Voir l&apos;historique
                <ArrowRight className="w-3 h-3" />
              </Link>
              <Link
                href="/dashboard/meetings"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Retour aux réunions
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
