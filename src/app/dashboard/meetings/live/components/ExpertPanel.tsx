"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ExpertInsightEntry } from "../hooks/useRealtimeExpertInsights";
import { EXPERTS, EXPERT_MAP } from "@/lib/live/expert/expert-registry";
import { ExpertQuestionModal } from "./ExpertQuestionModal";

/** Animated skeleton card shown while the LLM is generating an insight. */
function PendingInsightCard({ expertId }: { expertId: string | null }) {
  const expert = expertId ? EXPERT_MAP[expertId] : null;
  const color = expert?.color ?? "#8B5CF6";
  const name = expert?.name ?? "Expert";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border bg-secondary/20 overflow-hidden relative"
      style={{ borderLeftColor: color, borderLeftWidth: 3, borderColor: `${color}33` }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.08, 0.22, 0.08] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: `radial-gradient(120% 80% at 0% 50%, ${color}33, transparent 60%)` }}
      />
      <div className="relative px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color }} />
            Analyse en cours…
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 rounded bg-secondary/60 animate-pulse w-11/12" />
          <div className="h-2 rounded bg-secondary/60 animate-pulse w-9/12" />
          <div className="h-2 rounded bg-secondary/60 animate-pulse w-7/12" />
        </div>
      </div>
    </motion.div>
  );
}

function InsightCard({ insight }: { insight: ExpertInsightEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = EXPERT_MAP[insight.expert_id]?.color ?? "#6B7280";
  const timeStr = new Date(insight.created_at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-border bg-secondary/20 overflow-hidden"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold text-foreground">{insight.expert_name}</span>
          </div>
          <span className="text-xs text-muted-foreground">{timeStr}</span>
        </div>

        <p className="text-xs text-foreground leading-relaxed font-medium">
          &ldquo;{insight.take}&rdquo;
        </p>

        {insight.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {insight.tags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Approfondir
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border/40 pt-2.5">
              <p className="text-xs text-foreground/80 leading-relaxed">{insight.analysis}</p>
              {insight.relevance_context && (
                <p className="text-xs text-muted-foreground mt-1.5 italic">
                  Contexte : {insight.relevance_context}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ExpertPanelProps {
  insights: ExpertInsightEntry[];
  meetingId: string | null;
  onRequestExpert?: (expertId: string, question?: string) => void;
  isRequesting?: boolean;
  pendingExpertId?: string | null;
}

export function ExpertPanel({
  insights,
  meetingId,
  onRequestExpert,
  isRequesting,
  pendingExpertId,
}: ExpertPanelProps) {
  const [modalExpert, setModalExpert] = useState<{ id: string; name: string } | null>(null);
  const sorted = [...insights].reverse();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        <AnimatePresence initial={false}>
          {isRequesting && (
            <PendingInsightCard key="pending" expertId={pendingExpertId ?? null} />
          )}
          {sorted.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </AnimatePresence>

        {/* Grille des experts — toujours visible */}
        {meetingId && onRequestExpert && (
          <div className="space-y-1.5">
            {insights.length === 0 && !isRequesting && (
              <p className="text-xs text-muted-foreground text-center py-2 opacity-70">
                Choisissez un expert pour obtenir son analyse
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {EXPERTS.map((expert) => (
                <button
                  key={expert.id}
                  onClick={() => setModalExpert({ id: expert.id, name: expert.name })}
                  disabled={isRequesting}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-secondary/10 hover:bg-secondary/30 hover:border-primary/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: expert.color }} />
                  <span className="text-xs text-foreground leading-tight truncate">
                    {expert.name.replace("Expert ", "")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal question ciblée */}
      {onRequestExpert && (
        <ExpertQuestionModal
          open={!!modalExpert}
          onOpenChange={(open) => { if (!open) setModalExpert(null); }}
          expertName={modalExpert?.name ?? ""}
          isLoading={!!isRequesting}
          onSubmit={(question) => {
            if (modalExpert) {
              onRequestExpert(modalExpert.id, question);
              setModalExpert(null);
            }
          }}
        />
      )}
    </div>
  );
}
