"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  ExternalLink,
  History,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import type { BlindSpotEntry } from "../hooks/useRealtimeBlindSpots";
import type { BlindSpotSeverity, BlindSpotType } from "@/lib/live/blind-spots";

const severityConfig: Record<
  BlindSpotSeverity,
  { color: string; bg: string; border: string; Icon: typeof AlertTriangle }
> = {
  critical: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    Icon: AlertTriangle,
  },
  warning: {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    Icon: AlertCircle,
  },
  info: {
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    Icon: Info,
  },
};

const typeBadge: Record<BlindSpotType, { label: string; bg: string; text: string }> = {
  docs: { label: "Doc", bg: "bg-primary/10", text: "text-primary" },
  memory: { label: "Mémoire", bg: "bg-violet-500/10", text: "text-violet-400" },
  external: { label: "Externe", bg: "bg-blue-500/10", text: "text-blue-400" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function SpotCard({
  spot,
  meetingId,
  onSourceClick,
}: {
  spot: BlindSpotEntry;
  meetingId: string | null;
  onSourceClick?: (spot: BlindSpotEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [vote, setVote] = useState<1 | -1 | null>(null);
  const [voting, setVoting] = useState(false);

  const handleVote = async (rating: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!meetingId || voting) return;
    setVoting(true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/blind-spots/${spot.id}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        }
      );
      if (res.ok) setVote(rating);
    } catch {
      // silent
    } finally {
      setVoting(false);
    }
  };
  const cfg = severityConfig[spot.severity];
  const badge = typeBadge[spot.type];
  const Icon = cfg.Icon;

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceClick?.(spot);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 text-left"
      >
        <div className="flex items-start gap-2">
          <Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span
                className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
              {spot.is_manual && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground">
                  Manuel
                </span>
              )}
              {spot.domain && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                  {spot.domain}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                {formatTime(spot.created_at)}
                {expanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{spot.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {spot.description}
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="px-3 py-2.5 space-y-2">
              {spot.recommended_action && (
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Action proposée : </span>
                  <span className="text-muted-foreground">{spot.recommended_action}</span>
                </div>
              )}
              {spot.source_reference && (
                <button
                  type="button"
                  onClick={handleSourceClick}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  {spot.source_type === "document" ? (
                    <FileText className="w-3 h-3" />
                  ) : spot.source_type === "web" ? (
                    <ExternalLink className="w-3 h-3" />
                  ) : (
                    <History className="w-3 h-3" />
                  )}
                  {sourceLabel(spot)}
                </button>
              )}
              {/* Feedback thumbs */}
              <div className="flex items-center gap-1.5 pt-1">
                {vote ? (
                  <span className="text-[10px] text-muted-foreground">Merci</span>
                ) : (
                  <>
                    <span className="text-[10px] text-muted-foreground mr-1">Pertinent ?</span>
                    <button
                      type="button"
                      onClick={(e) => handleVote(1, e)}
                      disabled={voting}
                      className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-colors disabled:opacity-50"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleVote(-1, e)}
                      disabled={voting}
                      className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function sourceLabel(spot: BlindSpotEntry): string {
  const ref = spot.source_reference;
  if (!ref) return "Source";
  if (spot.source_type === "document" && "document_name" in ref) {
    return ref.document_name;
  }
  if (spot.source_type === "web" && "title" in ref) {
    return ref.title;
  }
  if (spot.source_type === "meeting_history" && "meeting_id" in ref) {
    return `Réunion précédente${ref.meeting_date ? ` (${ref.meeting_date})` : ""}`;
  }
  return "Source";
}

interface BlindSpotsPanelProps {
  spots: BlindSpotEntry[];
  meetingId: string | null;
  onRequestManual?: () => void;
  onSourceClick?: (spot: BlindSpotEntry) => void;
  isManualLoading?: boolean;
}

type SeverityFilter = "all" | BlindSpotSeverity;
type TypeFilter = "all" | BlindSpotType;

export function BlindSpotsPanel({
  spots,
  meetingId,
  onRequestManual,
  onSourceClick,
  isManualLoading,
}: BlindSpotsPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filtered = useMemo(() => {
    return spots
      .filter((s) => severityFilter === "all" || s.severity === severityFilter)
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .slice()
      .reverse(); // chronologique inverse, le plus récent en haut
  }, [spots, severityFilter, typeFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header avec contrôles */}
      <div className="px-3 py-2 border-b border-border/30 space-y-2 shrink-0">
        <div className="flex items-center justify-end gap-2">
          {onRequestManual && (
            <button
              type="button"
              onClick={onRequestManual}
              disabled={isManualLoading}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/15 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              {isManualLoading ? "Recherche..." : "Demander"}
            </button>
          )}
        </div>

        {spots.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSeverityFilter(f)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  severityFilter === f
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Tous" : f === "critical" ? "Critique" : f === "warning" ? "Alerte" : "Info"}
              </button>
            ))}
            <span className="w-px h-3 bg-border mx-1" />
            {(["all", "docs", "memory", "external"] as TypeFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  typeFilter === t
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "Tous" : typeBadge[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <Sparkles className="w-6 h-6 text-muted-foreground opacity-40 mb-2" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {"Cliquez sur \"Demander\" pour solliciter une analyse d'angle mort."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((spot) => (
              <SpotCard key={spot.id} spot={spot} meetingId={meetingId} onSourceClick={onSourceClick} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
