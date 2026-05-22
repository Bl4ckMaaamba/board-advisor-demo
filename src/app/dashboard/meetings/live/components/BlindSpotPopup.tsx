"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, AlertCircle, Info, X, FileText, ExternalLink, History } from "lucide-react";
import type { BlindSpotEntry } from "../hooks/useRealtimeBlindSpots";
import type { BlindSpotSeverity } from "@/lib/live/blind-spots";

const severityConfig: Record<
  BlindSpotSeverity,
  {
    color: string;
    bg: string;
    border: string;
    Icon: typeof AlertTriangle;
    autoDismissMs: number;
  }
> = {
  critical: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/60",
    Icon: AlertTriangle,
    autoDismissMs: 60_000,
  },
  warning: {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    Icon: AlertCircle,
    autoDismissMs: 30_000,
  },
  info: {
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    border: "border-sky-500/40",
    Icon: Info,
    autoDismissMs: 30_000,
  },
};

interface BlindSpotPopupProps {
  spots: BlindSpotEntry[];
  onSourceClick?: (spot: BlindSpotEntry) => void;
}

interface VisiblePopup {
  spot: BlindSpotEntry;
  shownAt: number;
}

export function BlindSpotPopup({ spots, onSourceClick }: BlindSpotPopupProps) {
  const [visible, setVisible] = useState<VisiblePopup[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Au premier rendu : marquer tous les spots existants comme "déjà vus"
  // pour ne pas re-popper l'historique après un refresh ou navigation
  useEffect(() => {
    if (initialized) return;
    setSeen(new Set(spots.map((s) => s.id)));
    setInitialized(true);
  }, [initialized, spots]);

  // Détecte les nouveaux spots et les ajoute à la file visible
  useEffect(() => {
    if (!initialized) return;
    const newOnes = spots.filter((s) => !seen.has(s.id));
    if (newOnes.length === 0) return;

    setSeen((prev) => {
      const next = new Set(prev);
      newOnes.forEach((s) => next.add(s.id));
      return next;
    });

    setVisible((prev) => [
      ...prev,
      ...newOnes.map((spot) => ({ spot, shownAt: Date.now() })),
    ]);
  }, [spots, seen, initialized]);

  // Auto-dismiss
  useEffect(() => {
    if (visible.length === 0) return;
    const timers = visible.map((v) => {
      const cfg = severityConfig[v.spot.severity];
      const remaining = cfg.autoDismissMs - (Date.now() - v.shownAt);
      return setTimeout(() => {
        dismiss(v.spot.id);
      }, Math.max(0, remaining));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  const dismiss = (id: string) => {
    setVisible((prev) => prev.filter((v) => v.spot.id !== id));
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {visible.map(({ spot }) => {
          const cfg = severityConfig[spot.severity];
          const Icon = cfg.Icon;
          return (
            <motion.div
              key={spot.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`pointer-events-auto rounded-xl border-2 ${cfg.border} ${cfg.bg} backdrop-blur-md shadow-2xl overflow-hidden`}
            >
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className={`text-[10px] uppercase tracking-wide font-semibold ${cfg.color}`}>
                      Angle mort
                    </span>
                    {spot.domain && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground">
                        {spot.domain}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(spot.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Fermer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-foreground leading-snug mb-1">
                  {spot.title}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {spot.description}
                </p>
                {spot.source_reference && (
                  <button
                    type="button"
                    onClick={() => onSourceClick?.(spot)}
                    className="mt-2 flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                  >
                    {spot.source_type === "document" ? (
                      <FileText className="w-3 h-3" />
                    ) : spot.source_type === "web" ? (
                      <ExternalLink className="w-3 h-3" />
                    ) : (
                      <History className="w-3 h-3" />
                    )}
                    Voir la source
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
