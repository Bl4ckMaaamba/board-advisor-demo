"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, MinusCircle, ExternalLink } from "lucide-react";
import type { FactCheckEntry } from "../hooks/useRealtimeFactChecks";

const VERDICT_CONFIG = {
  true: {
    icon: CheckCircle2,
    label: "Vrai",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  false: {
    icon: XCircle,
    label: "Faux",
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
  },
  partial: {
    icon: AlertTriangle,
    label: "Partiel",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  unverifiable: {
    icon: HelpCircle,
    label: "Non verifiable",
    color: "text-zinc-400",
    bg: "bg-zinc-400/10 border-zinc-400/20",
  },
  needs_context: {
    icon: MinusCircle,
    label: "Contexte requis",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
  },
} as const;

interface FactCheckPanelProps {
  factChecks: FactCheckEntry[];
}

export function FactCheckPanel({ factChecks }: FactCheckPanelProps) {
  if (factChecks.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-xs py-6">
        Les verifications apparaitront ici
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {factChecks.map((fc) => {
          const config = VERDICT_CONFIG[fc.verdict];
          const Icon = config.icon;

          return (
            <motion.div
              key={fc.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className={`rounded-lg border p-3 ${config.bg}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(fc.confidence * 100)}% confiance
                    </span>
                  </div>
                  <p className="text-xs text-foreground font-medium mb-1 line-clamp-2">
                    &ldquo;{fc.claim}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {fc.explanation}
                  </p>
                  {fc.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {fc.sources.slice(0, 3).map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          {src.provider}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
