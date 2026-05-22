"use client";

import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import {
  FileText,
  TrendingUp,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react";

interface ChatEmptyStateProps {
  onSuggestion: (text: string) => void;
  meetingTitle?: string;
}

const defaultSuggestions = [
  {
    icon: FileText,
    title: "Analyser un document",
    description: "Soumettre un PV ou rapport pour analyse",
    prompt: "Je souhaite analyser un document de mon conseil d'administration.",
  },
  {
    icon: TrendingUp,
    title: "Analyse sectorielle",
    description: "Tendances et benchmarks du secteur",
    prompt:
      "Peux-tu me fournir une analyse sectorielle avec les dernières tendances ?",
  },
  {
    icon: ShieldCheck,
    title: "Vérifier la conformité",
    description: "Obligations légales et réglementaires",
    prompt:
      "Quelles sont les obligations légales actuelles pour notre conseil d'administration ?",
  },
  {
    icon: CalendarCheck,
    title: "Préparer une réunion",
    description: "Ordre du jour et points clés",
    prompt:
      "Aide-moi à préparer l'ordre du jour pour la prochaine réunion du conseil.",
  },
];

function getMeetingSuggestions(title: string) {
  return [
    {
      icon: FileText,
      title: "Résumer les documents",
      description: "Synthèse des documents sélectionnés",
      prompt: `Résume les documents sélectionnés pour préparer la réunion "${title}".`,
    },
    {
      icon: CalendarCheck,
      title: "Ordre du jour",
      description: "Préparer un ordre du jour structuré",
      prompt: `Prépare un ordre du jour structuré pour la réunion "${title}" en te basant sur les documents disponibles.`,
    },
    {
      icon: ShieldCheck,
      title: "Points clés et risques",
      description: "Identifier les enjeux importants",
      prompt: `Quels sont les points clés et risques à surveiller pour la réunion "${title}" ?`,
    },
    {
      icon: TrendingUp,
      title: "Questions à anticiper",
      description: "Préparer les réponses aux questions",
      prompt: `Quelles questions pourraient être posées lors de la réunion "${title}" et comment y répondre ?`,
    },
  ];
}

export function ChatEmptyState({ onSuggestion, meetingTitle }: ChatEmptyStateProps) {
  const suggestions = meetingTitle ? getMeetingSuggestions(meetingTitle) : defaultSuggestions;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
          {meetingTitle ? "Préparez votre réunion" : "Bonjour, comment puis-je vous aider ?"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {meetingTitle
            ? "Utilisez les documents sélectionnés pour préparer votre prochaine réunion."
            : "Je suis votre assistant de gouvernance. Posez-moi une question ou choisissez un sujet ci-dessous."}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestions.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
          >
            <SpotlightCard className="h-full">
              <button
                onClick={() => onSuggestion(s.prompt)}
                className="w-full text-left p-4 group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                    <s.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-0.5">
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                </div>
              </button>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
