"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeetingPrepModal } from "@/components/meetings/meeting-prep-modal";
import { useBoardContext } from "@/lib/board-context";
import { supabase } from "@/lib/supabase";
import {
  Calendar,
  Clock,
  Users,
  Plus,
  MessageSquare,
  X,
  Loader2,
  Radio,
  UserPlus,
  Shield,
  Trash2,
  AlertTriangle,
  Crown,
  Eye,
  User,
  CheckCircle2,
  Mic,
  Lightbulb,
  ArrowLeft,
  FileText,
  ChevronRight,
  Filter,
  Video,
  Monitor,
  Brain,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { EXPERTS } from "@/lib/live/expert/expert-registry";

// Live meeting imports
import { useLiveSession } from "./live/hooks/useLiveSession";
import { useRealtimeFactChecks } from "./live/hooks/useRealtimeFactChecks";
import { useRealtimeModeration } from "./live/hooks/useRealtimeModeration";
import { useRealtimeSuggestions } from "./live/hooks/useRealtimeSuggestions";
import { useRealtimeExpertInsights } from "./live/hooks/useRealtimeExpertInsights";
import { useRealtimeBlindSpots, type BlindSpotEntry } from "./live/hooks/useRealtimeBlindSpots";
import { LiveMeetingControls } from "./live/components/LiveMeetingControls";
import { FactCheckPanel } from "./live/components/FactCheckPanel";
import { ModerationAlerts } from "./live/components/ModerationAlerts";
import { SuggestionsPanel } from "./live/components/SuggestionsPanel";
import { ExpertPanel } from "./live/components/ExpertPanel";
import { BlindSpotsPanel } from "./live/components/BlindSpotsPanel";
import { BlindSpotPopup } from "./live/components/BlindSpotPopup";
import { BlindSpotRequestModal } from "./live/components/BlindSpotRequestModal";
import { LivePanelDetailModal } from "./live/components/LivePanelDetailModal";
import { LatencyIndicator } from "./live/components/LatencyIndicator";
import { MeetingLobby } from "@/components/live/MeetingLobby";
import { ConnectedMicsPanel } from "@/components/live/ConnectedMicsPanel";
import { DocumentPreviewModal } from "@/components/documents/DocumentPreviewModal";

/* ───────── Types ───────── */

interface Meeting {
  id: string;
  title: string;
  board_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  scheduled_at: string | null;
  user_id: string;
  admin_user_id: string;
  created_at: string;
  meeting_type?: "in_person" | "visio";
  meeting_url?: string | null;
  recall_bot_id?: string | null;
  recall_bot_status?: string | null;
}

interface Participant {
  id: string;
  meeting_id: string;
  user_id: string | null;
  email: string;
  role: "admin" | "member";
  type: "permanent" | "exceptional";
  status: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

interface DocInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  category: string | null;
}

type StatusFilter = "all" | "upcoming" | "recording" | "completed";

interface ConfirmAction {
  type: "promote" | "remove";
  participantId: string;
  participantName: string;
  meetingId: string;
}

/* ───────── Helpers ───────── */

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } } as const;
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const statusLabels: Record<string, string> = {
  idle: "Planifiee",
  recording: "En cours",
  paused: "En pause",
  completed: "Terminee",
};
const statusColors: Record<string, string> = {
  idle: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  recording: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-secondary text-muted-foreground",
};
const roleLabels: Record<string, string> = { admin: "Admin", member: "Membre" };
const roleIcons: Record<string, typeof User> = { admin: Crown, member: User, observer: Eye };

function fmt(dateStr: string | null): string {
  if (!dateStr) return "Non definie";
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - now.getTime()) / 86400000);
}
function getUrgencyBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return { label: "Passee", cls: "bg-secondary text-muted-foreground", pulse: false };
  if (days === 0) return { label: "Aujourd'hui", cls: "bg-red-500/10 text-red-500", pulse: true };
  if (days === 1) return { label: "Demain", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", pulse: false };
  if (days <= 7) return { label: `Dans ${days}j`, cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", pulse: false };
  return { label: `Dans ${days}j`, cls: "bg-secondary text-muted-foreground", pulse: false };
}
function pName(p: Participant): string {
  return p.profiles?.full_name || p.profiles?.email || p.email || "Inconnu";
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/* ───────── Confirm Modal ───────── */

function ConfirmModal({ action, loading, onConfirm, onCancel }: {
  action: ConfirmAction; loading: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const msgs: Record<string, { title: string; desc: string; btn: string; color: string }> = {
    promote: {
      title: "Promouvoir en admin",
      desc: `Promouvoir ${action.participantName} en admin ? L'admin actuel sera retrogade en membre.`,
      btn: "Promouvoir", color: "bg-primary text-primary-foreground hover:bg-primary/90",
    },
    remove: {
      title: "Supprimer le participant",
      desc: `Supprimer ${action.participantName} de cette reunion ? Action irreversible.`,
      btn: "Supprimer", color: "bg-red-500 text-white hover:bg-red-600",
    },
  };
  const m = msgs[action.type];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{m.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{m.desc}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${m.color}`}>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {m.btn}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────── Add Guest Modal ───────── */

function AddGuestModal({ meetingId, onClose, onAdded }: {
  meetingId: string; onClose: () => void; onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/participants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: "member" }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Erreur"); return; }
      onAdded(); onClose();
    } catch { setError("Erreur reseau"); } finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Ajouter un invite</h3>
        </div>
        <div className="space-y-4 mb-6">
          <div className="space-y-2">
            <Label htmlFor="guestEmail">Email *</Label>
            <Input id="guestEmail" type="email" placeholder="invite@exemple.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            Annuler
          </button>
          <button onClick={submit} disabled={!email.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Ajouter
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────── Live Meeting Panel ───────── */

function LiveMeetingPanel({ meeting, onBack, currentUserId }: { meeting: Meeting; onBack: () => void; currentUserId: string | null }) {
  const session = useLiveSession();
  const isVisio = meeting.meeting_type === "visio";
  const effectiveMeetingId = isVisio ? meeting.id : session.meetingId;
  const factChecks = useRealtimeFactChecks(effectiveMeetingId);
  const moderations = useRealtimeModeration(effectiveMeetingId);
  const suggestions = useRealtimeSuggestions(effectiveMeetingId);
  const expertInsights = useRealtimeExpertInsights(effectiveMeetingId);
  const blindSpots = useRealtimeBlindSpots(effectiveMeetingId);
  const [requestingInsight, setRequestingInsight] = useState(false);
  const [requestingBlindSpot, setRequestingBlindSpot] = useState(false);
  const [blindSpotModalOpen, setBlindSpotModalOpen] = useState(false);
  const isActive = session.status === "recording" || session.status === "completed";

  const handleRequestInsight = useCallback(async (expertId: string) => {
    if (!effectiveMeetingId || requestingInsight) return;
    setRequestingInsight(true);
    try {
      await fetch(`/api/meetings/${effectiveMeetingId}/expert-panel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expert_id: expertId }),
      });
    } catch {
      // silent
    } finally {
      setRequestingInsight(false);
    }
  }, [effectiveMeetingId, requestingInsight]);

  const handleRequestBlindSpot = useCallback(() => {
    if (!effectiveMeetingId || requestingBlindSpot) return;
    setBlindSpotModalOpen(true);
  }, [effectiveMeetingId, requestingBlindSpot]);

  const handleSubmitBlindSpot = useCallback(async (query?: string) => {
    if (!effectiveMeetingId) return;
    setRequestingBlindSpot(true);
    setBlindSpotModalOpen(false);
    try {
      const res = await fetch(`/api/meetings/${effectiveMeetingId}/blind-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_query: query || undefined }),
      });
      if (!res.ok) {
        console.error("[blind-spots] request failed", await res.text());
      }
    } catch (err) {
      console.error("[blind-spots] request error", err);
    } finally {
      setRequestingBlindSpot(false);
    }
  }, [effectiveMeetingId]);

  const handleBlindSpotSourceClick = useCallback((spot: BlindSpotEntry) => {
    const ref = spot.source_reference;
    if (spot.source_type === "web" && ref && "url" in ref) {
      window.open(ref.url, "_blank", "noopener,noreferrer");
    }
  }, []);

  // Modal de détail unifié
  const [detailModal, setDetailModal] = useState<{
    title: string;
    accentColor?: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
  } | null>(null);

  // Auto-resume visio session if meeting is already recording (e.g. after page refresh)
  useEffect(() => {
    if (isVisio && meeting.status === "recording" && session.status === "idle") {
      session.resumeVisio(meeting.id);
    }
  }, [isVisio, meeting.status, meeting.id, session.status, session.resumeVisio]);

  // Wrap start to handle visio vs in-person
  const handleStart = useCallback(async (title: string) => {
    if (isVisio) {
      await session.startVisio(meeting.id);
    } else {
      await session.start(title, meeting.board_id ?? undefined, meeting.id);
    }
  }, [isVisio, meeting.id, meeting.board_id, session]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col">
      <div className="mb-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-foreground tracking-tight">{meeting.title} — En direct</h2>
            <p className="text-muted-foreground mt-1 text-sm">Transcription, fact-checking et moderation en temps reel</p>
          </div>
          <div className="flex items-center gap-4">
            <LatencyIndicator avgLatencyMs={session.metrics?.avg_latency_ms ?? 0} isRecording={session.isRecording} />
            {isVisio && session.recallBotStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                session.recallBotStatus === "recording" ? "bg-green-500/10 text-green-400" :
                session.recallBotStatus === "in_call" ? "bg-blue-500/10 text-blue-400" :
                session.recallBotStatus === "joining" ? "bg-yellow-500/10 text-yellow-400" :
                "bg-secondary text-muted-foreground"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  session.recallBotStatus === "recording" ? "bg-green-400 animate-pulse" :
                  session.recallBotStatus === "joining" ? "bg-yellow-400 animate-pulse" :
                  "bg-blue-400"
                }`} />
                {session.recallBotStatus === "joining" ? "Bot en attente" :
                 session.recallBotStatus === "in_call" ? "Bot connecte" :
                 session.recallBotStatus === "recording" ? "Enregistrement" : session.recallBotStatus}
              </span>
            )}
            <LiveMeetingControls status={session.status} onStart={handleStart} onStop={session.stop} error={session.error} initialTitle={meeting.title} />
          </div>
        </div>
      </div>

      {/* In-person : panneau micros (host mic + QR code + liste connectés) */}
      {isActive && !isVisio && (
        <div className="mb-4">
          <ConnectedMicsPanel meetingId={effectiveMeetingId} currentUserId={currentUserId} />
        </div>
      )}

      {!isActive ? (
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-6">
              <Radio className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">Pret a demarrer</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
              Demarrez l&apos;enregistrement pour activer la transcription, le fact-checking et la moderation en temps reel.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl">
              {[
                { icon: Mic, title: "Transcription IA", desc: "Conversion parole en texte avec identification des intervenants" },
                { icon: Shield, title: "Fact-checking", desc: "Verification automatique des chiffres et affirmations" },
                { icon: Lightbulb, title: "Suggestions", desc: "Points a approfondir et actions en temps reel" },
              ].map((f) => (
                <div key={f.title} className="p-4 rounded-xl border border-border bg-secondary/20">
                  <f.icon className="w-5 h-5 text-primary mb-2" />
                  <p className="text-sm font-medium text-foreground mb-0.5">{f.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ minHeight: "70vh" }}>
          {/* Colonne gauche (1/4) : Modération + Suggestions */}
          <div className="flex flex-col gap-4 min-h-0">
            <div
              className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0 cursor-pointer hover:border-amber-400/40 transition-colors"
              onClick={() =>
                setDetailModal({
                  title: "Modération",
                  accentColor: "#fbbf24",
                  icon: <Users className="w-5 h-5 text-amber-400" />,
                  content: <ModerationAlerts moderations={moderations} />,
                })
              }
            >
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-foreground">Modération</span>
                <span className={`text-xs ml-auto ${moderations.length > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{moderations.length}</span>
              </div>
              <div className="flex-1 p-3 overflow-auto pointer-events-none">
                <ModerationAlerts moderations={moderations} />
              </div>
            </div>
            <div
              className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0 cursor-pointer hover:border-purple-400/40 transition-colors"
              onClick={() =>
                setDetailModal({
                  title: "Suggestions",
                  accentColor: "#a78bfa",
                  icon: <Lightbulb className="w-5 h-5 text-purple-400" />,
                  content: <SuggestionsPanel suggestions={suggestions} />,
                })
              }
            >
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Lightbulb className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-foreground">Suggestions</span>
                <span className={`text-xs ml-auto ${suggestions.length > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{suggestions.length}</span>
              </div>
              <div className="flex-1 p-3 overflow-auto pointer-events-none">
                <SuggestionsPanel suggestions={suggestions} />
              </div>
            </div>
          </div>

          {/* Centre (2/4) : Fact-checking dominant */}
          <div className="lg:col-span-2 rounded-2xl border-2 border-emerald-400/30 bg-card overflow-hidden flex flex-col min-h-0 shadow-lg shadow-emerald-500/5">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2 shrink-0 bg-emerald-500/5">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="font-playfair text-lg font-semibold text-foreground">Fact-checking</span>
              <span className={`text-sm ml-auto px-2 py-0.5 rounded-full ${factChecks.length > 0 ? "bg-emerald-500/10 text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
                {factChecks.length} {factChecks.length > 1 ? "vérifications" : "vérification"}
              </span>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <FactCheckPanel factChecks={factChecks} />
            </div>
          </div>

          {/* Colonne droite (1/4) : Panel Expert + Angles morts */}
          <div className="flex flex-col gap-4 min-h-0">
            <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                <Brain className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-foreground">Panel Expert</span>
                <span className={`text-xs ml-auto ${expertInsights.length > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{expertInsights.length}</span>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <ExpertPanel
                  insights={expertInsights}
                  meetingId={effectiveMeetingId}
                  onRequestExpert={handleRequestInsight}
                  isRequesting={requestingInsight}
                />
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0">
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
                  meetingId={effectiveMeetingId}
                  onRequestManual={handleRequestBlindSpot}
                  onSourceClick={handleBlindSpotSourceClick}
                  isManualLoading={requestingBlindSpot}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isActive && <BlindSpotPopup spots={blindSpots} onSourceClick={handleBlindSpotSourceClick} />}

      <BlindSpotRequestModal
        open={blindSpotModalOpen}
        onOpenChange={setBlindSpotModalOpen}
        onSubmit={handleSubmitBlindSpot}
        isLoading={requestingBlindSpot}
      />

      <LivePanelDetailModal
        isOpen={detailModal !== null}
        onClose={() => setDetailModal(null)}
        title={detailModal?.title ?? ""}
        icon={detailModal?.icon}
        accentColor={detailModal?.accentColor}
      >
        {detailModal?.content}
      </LivePanelDetailModal>

      {isActive && session.metrics && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{Math.round(session.metrics.session_duration_s / 60)}min {Math.round(session.metrics.session_duration_s % 60)}s</span>
          <div className="flex items-center gap-4">
            <span>{session.metrics.total_chunks} chunks</span>
            <span>{session.metrics.total_segments} segments</span>
            <span>{session.metrics.total_factchecks} fact-checks</span>
          </div>
        </div>
      )}

      {session.status === "completed" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <div className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Reunion terminee</p>
              <p className="text-xs text-muted-foreground mt-0.5">{factChecks.length} vérifications · {moderations.length} alertes · {suggestions.length} suggestions</p>
            </div>
            <button onClick={onBack} className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              Retour
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ───────── Meeting Detail View ───────── */

function MeetingDetail({
  meeting,
  boardName,
  isAdmin,
  currentUserId,
  onBack,
  onLaunchLive,
  onPrep,
  onConfirmAction,
  onAddGuest,
}: {
  meeting: Meeting;
  boardName: string;
  isAdmin: boolean;
  currentUserId: string | null;
  onBack: () => void;
  onLaunchLive: () => void;
  onPrep: () => void;
  onConfirmAction: (action: ConfirmAction) => void;
  onAddGuest: () => void;
}) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [loadingP, setLoadingP] = useState(true);
  const [loadingD, setLoadingD] = useState(true);
  const [uploadingAgenda, setUploadingAgenda] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState(meeting.meeting_url || "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [expertConfig, setExpertConfig] = useState<{ primary_expert_id: string; auto_selected: boolean } | null>(null);
  const [loadingExpert, setLoadingExpert] = useState(true);
  const [selectedExpertId, setSelectedExpertId] = useState("");
  const [savingExpert, setSavingExpert] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const canLaunchLive = meeting.status !== "completed";
  const daysUntil = getDaysUntil(meeting.scheduled_at);
  const badge = getUrgencyBadge(daysUntil);

  // Fetch participants
  const fetchP = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/participants`);
      if (res.ok) { const d = await res.json(); setParticipants(d.participants || []); }
    } catch { /* silent */ } finally { setLoadingP(false); }
  }, [meeting.id]);

  // Fetch documents (all categories)
  const fetchDocs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ meeting_id: meeting.id });
      if (meeting.board_id) params.set("board_id", meeting.board_id);
      const r = await fetch(`/api/documents?${params}`);
      const d = await r.json();
      setDocuments(d.documents || []);
    } catch { /* silent */ } finally { setLoadingD(false); }
  }, [meeting.id, meeting.board_id]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Split by category
  const agendaDocs = documents.filter((d) => d.category === "agenda");
  const regularDocs = documents.filter((d) => d.category !== "agenda");

  // Upload a file to the meeting with optional category
  const handleUploadFile = useCallback(async (file: File, category?: string) => {
    const setter = category === "agenda" ? setUploadingAgenda : setUploadingDoc;
    setter(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("meetingId", meeting.id);
      if (meeting.board_id) fd.append("board_id", meeting.board_id);
      if (category) fd.append("category", category);
      const res = await fetch("/api/rag/process", { method: "POST", body: fd });
      if (res.ok) await fetchDocs();
    } catch { /* silent */ } finally { setter(false); }
  }, [meeting.id, meeting.board_id, fetchDocs]);

  useEffect(() => { fetchP(); }, [fetchP]);

  // Fetch expert config
  useEffect(() => {
    fetch(`/api/meetings/${meeting.id}/expert-panel/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setExpertConfig(d);
          setSelectedExpertId(d.primary_expert_id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExpert(false));
  }, [meeting.id]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      {/* Back + title */}
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Toutes les reunions
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">{meeting.title}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[meeting.status] || "bg-secondary text-muted-foreground"}`}>
              {statusLabels[meeting.status] || meeting.status}
            </span>
            {meeting.meeting_type === "visio" ? (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-500/10 text-blue-400 flex items-center gap-1">
                <Video className="w-3 h-3" /> Visio
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                <Monitor className="w-3 h-3" /> Presentiel
              </span>
            )}
            {badge && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${badge.cls}`}>
                {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{boardName}</p>
          {meeting.meeting_type === "visio" && meeting.recall_bot_status && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                meeting.recall_bot_status === "recording" ? "bg-green-500/10 text-green-400" :
                meeting.recall_bot_status === "in_call" ? "bg-blue-500/10 text-blue-400" :
                meeting.recall_bot_status === "joining" ? "bg-yellow-500/10 text-yellow-400" :
                meeting.recall_bot_status === "error" ? "bg-red-500/10 text-red-400" :
                "bg-secondary text-muted-foreground"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  meeting.recall_bot_status === "recording" ? "bg-green-400 animate-pulse" :
                  meeting.recall_bot_status === "in_call" ? "bg-blue-400" :
                  meeting.recall_bot_status === "joining" ? "bg-yellow-400 animate-pulse" :
                  meeting.recall_bot_status === "error" ? "bg-red-400" :
                  "bg-muted-foreground"
                }`} />
                {meeting.recall_bot_status === "joining" && "Bot en attente"}
                {meeting.recall_bot_status === "in_call" && "Bot connecte"}
                {meeting.recall_bot_status === "recording" && "Enregistrement"}
                {meeting.recall_bot_status === "done" && "Termine"}
                {meeting.recall_bot_status === "error" && "Erreur bot"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 mt-2">
            {meeting.scheduled_at && (
              <>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" /> {fmt(meeting.scheduled_at)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" /> {fmtTime(meeting.scheduled_at)}
                </span>
              </>
            )}
            {!meeting.scheduled_at && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" /> Creee le {fmt(meeting.created_at)}
              </span>
            )}
          </div>
          {/* Visio URL editable */}
          {meeting.meeting_type === "visio" && isAdmin && (
            <div className="flex items-center gap-2 mt-2">
              <Video className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {editingUrl ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <button
                    disabled={savingUrl}
                    onClick={async () => {
                      setSavingUrl(true);
                      try {
                        const res = await fetch(`/api/meetings/${meeting.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ meeting_url: meetingUrl }),
                        });
                        if (res.ok) {
                          // If a Recall bot is active on the old URL, stop it
                          // so the user can relaunch on the new URL
                          if (meeting.recall_bot_id && meeting.status === "recording") {
                            await fetch("/api/live/stop-visio", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ meeting_id: meeting.id }),
                            }).catch(() => {});
                            meeting.status = "idle";
                            meeting.recall_bot_id = null;
                            meeting.recall_bot_status = null;
                          }
                          meeting.meeting_url = meetingUrl;
                          setEditingUrl(false);
                        }
                      } catch { /* silent */ }
                      setSavingUrl(false);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {savingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enregistrer"}
                  </button>
                  <button onClick={() => { setEditingUrl(false); setMeetingUrl(meeting.meeting_url || ""); }} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Annuler
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingUrl(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-md">
                  {meeting.meeting_url || "Ajouter un lien de visio..."}
                </button>
              )}
            </div>
          )}
          {meeting.meeting_type === "visio" && !isAdmin && meeting.meeting_url && (
            <div className="flex items-center gap-2 mt-2">
              <Video className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground truncate max-w-md">{meeting.meeting_url}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canLaunchLive && (
            <button onClick={onLaunchLive}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 transition-colors">
              <Radio className="w-4 h-4" /> Lancer en live
            </button>
          )}
          <button onClick={onPrep}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <MessageSquare className="w-4 h-4" /> Preparer
          </button>
        </div>
      </div>

      {/* Pre-launch lobby — only for in-person meetings that aren't live yet */}
      {meeting.meeting_type !== "visio" && meeting.status !== "recording" && meeting.status !== "completed" && (
        <div className="mb-6">
          <MeetingLobby meetingId={meeting.id} title={meeting.title} />
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Participants (2/3) */}
        <div className="lg:col-span-2">
          <SpotlightCard className="rounded-2xl border border-border bg-card">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Participants</h3>
                  {!loadingP && <span className="text-xs text-muted-foreground">({participants.length})</span>}
                </div>
                {isAdmin && (
                  <button onClick={onAddGuest}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Invite exceptionnel
                  </button>
                )}
              </div>

              {loadingP ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
              ) : participants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun participant</p>
              ) : (
                <div className="space-y-1">
                  {participants.map((p) => {
                    const RoleIcon = roleIcons[p.role] || User;
                    const name = pName(p);
                    const isMe = currentUserId && p.user_id === currentUserId;

                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/30 transition-colors group">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {p.profiles?.avatar_url ? (
                            <img src={p.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {name}
                            {isMe && <span className="text-xs text-muted-foreground ml-1.5">(vous)</span>}
                          </p>
                          {p.email && p.profiles?.full_name && (
                            <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RoleIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">{roleLabels[p.role]}</span>
                          {p.type === "exceptional" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">invite</span>
                          )}
                        </div>

                        {/* Admin actions */}
                        {isAdmin && p.role !== "admin" && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onConfirmAction({ type: "promote", participantId: p.id, participantName: name, meetingId: meeting.id })}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Promouvoir en admin">
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => onConfirmAction({ type: "remove", participantId: p.id, participantName: name, meetingId: meeting.id })}
                              className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors" title="Supprimer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Ordre du jour — document uploadé, même pipeline RAG */}
          <SpotlightCard className="rounded-2xl border border-border bg-card mt-6">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Ordre du jour</h3>
                  {!loadingD && agendaDocs.length > 0 && (
                    <span className="text-xs text-muted-foreground">({agendaDocs.length})</span>
                  )}
                </div>
                {isAdmin && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                    {uploadingAgenda ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Ajouter
                    <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.txt,.md"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleUploadFile(f, "agenda"); e.target.value = ""; } }} />
                  </label>
                )}
              </div>
              {loadingD ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>
              ) : agendaDocs.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Aucun ordre du jour déposé</p>
                  {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">PDF, DOCX, XLSX, TXT acceptés</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {agendaDocs.map((doc) => (
                    <button key={doc.id} onClick={() => setPreviewDocId(doc.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/20 border border-border/50 hover:bg-secondary/40 hover:border-border transition-colors text-left">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.type.toUpperCase()} · {formatSize(doc.size)}</p>
                      </div>
                      <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SpotlightCard>
        </div>

        {/* Right column: Documents + Expert Config */}
        <div className="space-y-6">
          {/* Documents (board pack) */}
          <SpotlightCard className="rounded-2xl border border-border bg-card">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Documents</h3>
                  {!loadingD && regularDocs.length > 0 && <span className="text-xs text-muted-foreground">({regularDocs.length})</span>}
                </div>
                {isAdmin && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                    {uploadingDoc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Ajouter
                    <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.txt,.md"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleUploadFile(f); e.target.value = ""; } }} />
                  </label>
                )}
              </div>
              {loadingD ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
              ) : regularDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun document</p>
              ) : (
                <div className="space-y-2">
                  {regularDocs.map((doc) => (
                    <button key={doc.id} onClick={() => setPreviewDocId(doc.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/20 border border-border/50 hover:bg-secondary/40 hover:border-border transition-colors text-left">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.type.toUpperCase()} · {formatSize(doc.size)}</p>
                      </div>
                      <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Expert IA Config */}
          {meeting.status !== "completed" && (
            <SpotlightCard className="rounded-2xl border border-border bg-card">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-foreground">Expert IA</h3>
                </div>

                {loadingExpert ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!expertConfig && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        L&apos;expert sera sélectionné automatiquement selon le secteur du board au démarrage du live.
                      </p>
                    )}

                    {/* Expert selector */}
                    {isAdmin && (
                      <>
                        <div className="relative">
                          <select
                            value={selectedExpertId}
                            onChange={(e) => setSelectedExpertId(e.target.value)}
                            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg border border-border bg-secondary/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <option value="">Sélection automatique</option>
                            {EXPERTS.map((expert) => (
                              <option key={expert.id} value={expert.id}>
                                {expert.name} — {expert.title}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>

                        {selectedExpertId && selectedExpertId !== (expertConfig?.primary_expert_id ?? "") && (
                          <button
                            disabled={savingExpert}
                            onClick={async () => {
                              setSavingExpert(true);
                              try {
                                const res = await fetch(`/api/meetings/${meeting.id}/expert-panel/config`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ primary_expert_id: selectedExpertId, auto_selected: false }),
                                });
                                if (res.ok) {
                                  const d = await res.json();
                                  setExpertConfig(d);
                                }
                              } catch { /* silent */ }
                              setSavingExpert(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs font-semibold hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                          >
                            {savingExpert ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmer l'expert"}
                          </button>
                        )}
                      </>
                    )}

                    {/* Current expert badge */}
                    {expertConfig && (() => {
                      const expert = EXPERTS.find((e) => e.id === expertConfig.primary_expert_id);
                      if (!expert) return null;
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 border border-border/50">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: expert.color }} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{expert.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{expert.title}</p>
                          </div>
                          {expertConfig.auto_selected && (
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">auto</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </SpotlightCard>
          )}
        </div>
      </div>

      <DocumentPreviewModal
        documentId={previewDocId}
        isOpen={previewDocId !== null}
        onClose={() => setPreviewDocId(null)}
        onDeleted={(id) => {
          setDocuments((prev) => prev.filter((d) => d.id !== id));
          setPreviewDocId(null);
        }}
      />
    </motion.div>
  );
}

/* ───────── Main Page ───────── */

export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingsContent />
    </Suspense>
  );
}

function MeetingsContent() {
  const { selectedBoard, boards, ready } = useBoardContext();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBoardId, setNewBoardId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newMeetingType, setNewMeetingType] = useState<"in_person" | "visio">("in_person");
  const [newMeetingUrl, setNewMeetingUrl] = useState("");

  // Views
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [liveMeeting, setLiveMeeting] = useState<Meeting | null>(null);
  const [prepMeeting, setPrepMeeting] = useState<Meeting | null>(null);

  // Modals
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [addGuestMeetingId, setAddGuestMeetingId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Fetch meetings
  const fetchMeetings = useCallback(async () => {
    try {
      const boardFilter = selectedBoard !== "Tous" ? `?board_id=${selectedBoard}` : "";
      const res = await fetch(`/api/meetings${boardFilter}`);
      if (res.ok) { const data = await res.json(); setMeetings(data.meetings || []); }
    } catch { /* silent */ } finally { setLoadingMeetings(false); }
  }, [selectedBoard]);

  useEffect(() => { if (ready) { setLoadingMeetings(true); fetchMeetings(); } }, [fetchMeetings, ready]);

  useEffect(() => {
    if (selectedBoard !== "Tous") setNewBoardId(selectedBoard);
  }, [selectedBoard]);

  // Create meeting
  const handleAddMeeting = async () => {
    if (!newTitle.trim() || !newBoardId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          board_id: newBoardId,
          meeting_type: newMeetingType,
          ...(newDate && { scheduled_at: new Date(newDate).toISOString() }),
          ...(newMeetingType === "visio" && newMeetingUrl && { meeting_url: newMeetingUrl.trim() }),
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      setNewTitle(""); setNewBoardId(selectedBoard !== "Tous" ? selectedBoard : ""); setNewDate(""); setNewMeetingType("in_person"); setNewMeetingUrl("");
      setShowAddForm(false); await fetchMeetings();
    } catch { alert("Erreur reseau"); } finally { setCreating(false); }
  };

  // Confirm action
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.type === "remove") {
        await fetch(`/api/meetings/${confirmAction.meetingId}/participants`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_id: confirmAction.participantId }),
        });
      } else {
        await fetch(`/api/meetings/${confirmAction.meetingId}/participants`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_id: confirmAction.participantId, role: "admin" }),
        });
      }
      await fetchMeetings();
      // Force re-render of detail view by updating selectedMeeting
      if (selectedMeeting?.id === confirmAction.meetingId) {
        setSelectedMeeting((prev) => prev ? { ...prev } : null);
      }
    } catch { /* silent */ } finally { setConfirmLoading(false); setConfirmAction(null); }
  };

  // Helpers
  const getBoardName = (boardId: string) => boards.find((b) => b.id === boardId)?.name || "Board inconnu";
  const isUserAdmin = (meeting: Meeting): boolean => {
    if (!currentUserId) return false;
    if (meeting.admin_user_id === currentUserId) return true;
    const board = boards.find((b) => b.id === meeting.board_id);
    return board?.role === "owner" || board?.role === "admin";
  };

  // Helpers for filtering: a meeting is "upcoming" if it's idle AND scheduled today or later (or no date set)
  const isUpcoming = (m: Meeting) => {
    if (m.status !== "idle") return false;
    if (!m.scheduled_at) return true; // no date = still upcoming
    const days = getDaysUntil(m.scheduled_at);
    return days !== null && days >= 0;
  };
  const isPast = (m: Meeting) => {
    if (m.status === "completed") return true;
    // idle but date is in the past
    if (m.status === "idle" && m.scheduled_at) {
      const days = getDaysUntil(m.scheduled_at);
      return days !== null && days < 0;
    }
    return false;
  };

  // Filter
  const filteredMeetings = meetings.filter((m) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "upcoming") return isUpcoming(m);
    if (statusFilter === "recording") return m.status === "recording" || m.status === "paused";
    // "completed" = completed + past idle meetings
    return isPast(m);
  });

  const counts = {
    all: meetings.length,
    upcoming: meetings.filter(isUpcoming).length,
    recording: meetings.filter((m) => m.status === "recording" || m.status === "paused").length,
    completed: meetings.filter(isPast).length,
  };

  // ─── Live view ───
  if (liveMeeting) {
    return <LiveMeetingPanel meeting={liveMeeting} onBack={() => setLiveMeeting(null)} currentUserId={currentUserId} />;
  }

  // ─── Detail view ───
  if (selectedMeeting) {
    return (
      <>
        <MeetingDetail
          key={selectedMeeting.id + selectedMeeting.admin_user_id}
          meeting={selectedMeeting}
          boardName={getBoardName(selectedMeeting.board_id)}
          isAdmin={isUserAdmin(selectedMeeting)}
          currentUserId={currentUserId}
          onBack={() => setSelectedMeeting(null)}
          onLaunchLive={() => { setLiveMeeting(selectedMeeting); setSelectedMeeting(null); }}
          onPrep={() => setPrepMeeting(selectedMeeting)}
          onConfirmAction={setConfirmAction}
          onAddGuest={() => setAddGuestMeetingId(selectedMeeting.id)}
        />
        <MeetingPrepModal
          meetingId={prepMeeting?.id ?? ""}
          meetingTitle={prepMeeting?.title ?? ""}
          boardId={prepMeeting?.board_id ?? ""}
          boardName={prepMeeting ? getBoardName(prepMeeting.board_id) : ""}
          isOpen={!!prepMeeting}
          onClose={() => setPrepMeeting(null)}
        />
        <AnimatePresence>
          {confirmAction && (
            <ConfirmModal action={confirmAction} loading={confirmLoading} onConfirm={handleConfirmAction} onCancel={() => setConfirmAction(null)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {addGuestMeetingId && (
            <AddGuestModal meetingId={addGuestMeetingId} onClose={() => setAddGuestMeetingId(null)}
              onAdded={() => { setSelectedMeeting((prev) => prev ? { ...prev } : null); }} />
          )}
        </AnimatePresence>
      </>
    );
  }

  // ─── List view ───
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">Reunions</h1>
          <p className="text-muted-foreground mt-1">Gerez vos reunions de conseil et comites.</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? "Annuler" : "Planifier une reunion"}
        </button>
      </motion.div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
            <SpotlightCard className="rounded-2xl border border-border bg-card">
              <form onSubmit={(e) => { e.preventDefault(); handleAddMeeting(); }} className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Nouvelle reunion</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="meetingTitle">Titre *</Label>
                    <Input id="meetingTitle" placeholder="Comite strategique Q2..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meetingBoard">Board *</Label>
                    <select id="meetingBoard" value={newBoardId} onChange={(e) => setNewBoardId(e.target.value)} required
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
                      <option value="">Selectionner...</option>
                      {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meetingDate">Date et heure</Label>
                    <Input id="meetingDate" type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Type de reunion</Label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setNewMeetingType("in_person"); setNewMeetingUrl(""); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                          newMeetingType === "in_person" ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
                        }`}>
                        <Mic className="w-4 h-4" /> Presentiel
                      </button>
                      <button type="button" onClick={() => setNewMeetingType("visio")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                          newMeetingType === "visio" ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
                        }`}>
                        <Video className="w-4 h-4" /> Visio
                      </button>
                    </div>
                  </div>
                  {newMeetingType === "visio" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="meetingUrl">Lien de visioconference *</Label>
                      <Input id="meetingUrl" placeholder="https://zoom.us/j/... ou https://meet.google.com/..." value={newMeetingUrl} onChange={(e) => setNewMeetingUrl(e.target.value)} required />
                      <p className="text-xs text-muted-foreground">Zoom, Google Meet ou Microsoft Teams</p>
                    </div>
                  )}
                </div>

                {/* Ordre du jour */}
                <div className="mt-4 flex gap-3">
                  <button type="submit" disabled={!newTitle.trim() || !newBoardId || creating || (newMeetingType === "visio" && !newMeetingUrl.trim())}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />} Creer
                  </button>
                  <button type="button" onClick={() => setShowAddForm(false)}
                    className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors">
                    Annuler
                  </button>
                </div>
              </form>
            </SpotlightCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 mb-6 flex-wrap">
        {([
          { key: "all" as StatusFilter, label: "Toutes", icon: Filter, count: counts.all },
          { key: "upcoming" as StatusFilter, label: "A venir", icon: Calendar, count: counts.upcoming },
          { key: "recording" as StatusFilter, label: "En cours", icon: Radio, count: counts.recording },
          { key: "completed" as StatusFilter, label: "Terminees", icon: CheckCircle2, count: counts.completed },
        ]).map((f) => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}>
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
            {f.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === f.key ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </motion.div>

      {/* Loading */}
      {loadingMeetings && (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      )}

      {/* List */}
      {!loadingMeetings && (
        <div className="space-y-3">
          {filteredMeetings.length === 0 && (
            <motion.div variants={fadeUp}>
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Aucune reunion dans cette categorie.</p>
              </div>
            </motion.div>
          )}

          {filteredMeetings.map((meeting) => {
            const daysUntil = getDaysUntil(meeting.scheduled_at);
            const badge = getUrgencyBadge(daysUntil);
            const boardName = getBoardName(meeting.board_id);

            return (
              <motion.div key={meeting.id} variants={fadeUp}>
                <button
                  onClick={() => setSelectedMeeting(meeting)}
                  className="w-full text-left"
                >
                  <SpotlightCard className="rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
                    <div className="p-5 flex items-center gap-4">
                      {/* Left content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h3 className="font-display text-base font-semibold text-foreground truncate">{meeting.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[meeting.status] || "bg-secondary text-muted-foreground"}`}>
                            {statusLabels[meeting.status] || meeting.status}
                          </span>
                          {meeting.meeting_type === "visio" ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 flex items-center gap-1">
                              <Video className="w-3 h-3" /> Visio
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                              <Monitor className="w-3 h-3" /> Presentiel
                            </span>
                          )}
                          {badge && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${badge.cls}`}>
                              {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{boardName}</span>
                          {meeting.scheduled_at && (
                            <>
                              <span className="text-border">|</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> {fmt(meeting.scheduled_at)} {fmtTime(meeting.scheduled_at)}
                              </span>
                            </>
                          )}
                          {!meeting.scheduled_at && (
                            <>
                              <span className="text-border">|</span>
                              <span>Creee le {fmt(meeting.created_at)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </SpotlightCard>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Prep modal (from list) */}
      <MeetingPrepModal
        meetingId={prepMeeting?.id ?? ""}
        meetingTitle={prepMeeting?.title ?? ""}
        boardId={prepMeeting?.board_id ?? ""}
        boardName={prepMeeting ? getBoardName(prepMeeting.board_id) : ""}
        isOpen={!!prepMeeting}
        onClose={() => setPrepMeeting(null)}
      />
    </motion.div>
  );
}
