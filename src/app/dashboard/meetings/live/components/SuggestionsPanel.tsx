"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Search, MessageCircleQuestion, CheckSquare, BookOpen } from "lucide-react";
import type { SuggestionEntry } from "../hooks/useRealtimeSuggestions";

const TYPE_CONFIG = {
  deep_dive: { icon: Search, label: "Approfondir", color: "text-purple-400" },
  question: { icon: MessageCircleQuestion, label: "Question", color: "text-blue-400" },
  action_item: { icon: CheckSquare, label: "Action", color: "text-emerald-400" },
  reference: { icon: BookOpen, label: "Reference", color: "text-amber-400" },
} as const;

const PRIORITY_BADGE = {
  high: "bg-red-400/20 text-red-300",
  medium: "bg-amber-400/20 text-amber-300",
  low: "bg-zinc-400/20 text-zinc-300",
} as const;

interface SuggestionsPanelProps {
  suggestions: SuggestionEntry[];
}

export function SuggestionsPanel({ suggestions }: SuggestionsPanelProps) {
  if (suggestions.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-xs py-6">
        <Lightbulb className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
        Les suggestions apparaitront au fil de la discussion
      </div>
    );
  }

  // Most recent first
  const sorted = [...suggestions].reverse();

  return (
    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {sorted.map((sug) => {
          const config = TYPE_CONFIG[sug.type];
          const Icon = config.icon;

          return (
            <motion.div
              key={sug.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-lg border border-border bg-secondary/20 p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                <span className={`text-xs font-bold uppercase ${config.color}`}>
                  {config.label}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[sug.priority]}`}>
                  {sug.priority}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">
                {sug.content}
              </p>
              {sug.context && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {sug.context}
                </p>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
