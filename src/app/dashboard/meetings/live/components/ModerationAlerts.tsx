"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, AlertOctagon, MessageSquare, Clock, Users } from "lucide-react";
import type { ModerationEntry } from "../hooks/useRealtimeModeration";

const SEVERITY_STYLE = {
  info: "bg-blue-400/10 border-blue-400/20 text-blue-400",
  warning: "bg-amber-400/10 border-amber-400/20 text-amber-400",
  alert: "bg-red-400/10 border-red-400/20 text-red-400",
} as const;

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  alert: AlertOctagon,
} as const;

const TYPE_ICON = {
  tone: MessageSquare,
  interruption: AlertTriangle,
  speaking_time: Clock,
  off_topic: Info,
  conflict: Users,
} as const;

interface ModerationAlertsProps {
  moderations: ModerationEntry[];
}

export function ModerationAlerts({ moderations }: ModerationAlertsProps) {
  if (moderations.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-xs py-6">
        Aucune alerte de moderation
      </div>
    );
  }

  // Show most recent first
  const sorted = [...moderations].reverse();

  return (
    <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {sorted.map((mod) => {
          const SeverityIcon = SEVERITY_ICON[mod.severity];
          const TypeIcon = TYPE_ICON[mod.type];

          return (
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${SEVERITY_STYLE[mod.severity]}`}
            >
              <SeverityIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <TypeIcon className="w-3 h-3 opacity-60" />
                  {mod.speaker && (
                    <span className="text-xs font-medium opacity-70">
                      {mod.speaker}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground leading-relaxed">
                  {mod.message}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
