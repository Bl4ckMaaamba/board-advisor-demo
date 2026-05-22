"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Search, TrendingUp, Scale, Globe, Building2, BarChart3, Activity, BrainCog, type LucideIcon } from "lucide-react";

const TOOL_ACTIVITY_MAP: Record<string, { text: string; icon: LucideIcon }> = {
  search_internal_documents: { text: "Recherche dans les documents internes...", icon: Search },
  get_financial_data: { text: "Analyse des données financières...", icon: TrendingUp },
  check_legal: { text: "Vérification des sources juridiques...", icon: Scale },
  search_news: { text: "Consultation des actualités...", icon: Globe },
  get_company_info: { text: "Récupération du profil entreprise...", icon: Building2 },
  sector_benchmark: { text: "Benchmark sectoriel en cours...", icon: BarChart3 },
  get_macro_indicators: { text: "Analyse des indicateurs macroéconomiques...", icon: Activity },
  deep_research: { text: "Deep Research en cours — peut prendre 2 à 5 minutes...", icon: Globe },
  canvas_generation: { text: "Génération de la présentation PowerPoint...", icon: BarChart3 },
};

const FALLBACK_MESSAGES = [
  { text: "Recherche en cours...", icon: Search },
];

const THINKING_MESSAGES = [
  { text: "Analyse des risques juridiques...", icon: Scale },
  { text: "Évaluation des risques financiers...", icon: TrendingUp },
  { text: "Identification des signaux faibles...", icon: Search },
  { text: "Raisonnement approfondi en cours...", icon: BrainCog },
];

interface ToolActivityIndicatorProps {
  tools?: string[];
  isThinking?: boolean;
}

export function ToolActivityIndicator({ tools, isThinking }: ToolActivityIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = useMemo(() => {
    if (isThinking) return THINKING_MESSAGES;
    if (!tools || tools.length === 0) return FALLBACK_MESSAGES;
    const mapped = tools
      .map((t) => TOOL_ACTIVITY_MAP[t])
      .filter(Boolean);
    return mapped.length > 0 ? mapped : FALLBACK_MESSAGES;
  }, [tools, isThinking]);

  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const displayMessages = isThinking ? [THINKING_MESSAGES[messageIndex]] : messages;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 max-w-[85%]"
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary text-foreground">
        <Bot className="w-4 h-4" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3 space-y-1.5">
        <AnimatePresence mode="wait">
          {displayMessages.map((msg, i) => {
            const Icon = msg.icon;
            return (
              <motion.div
                key={isThinking ? messageIndex : msg.text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ delay: isThinking ? 0 : i * 0.1, duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <Icon className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span className="text-sm text-muted-foreground">{msg.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
