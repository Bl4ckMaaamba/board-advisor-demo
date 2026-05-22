"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2 } from "lucide-react";
import type { SessionStatus } from "../hooks/useLiveSession";

interface LiveMeetingControlsProps {
  status: SessionStatus;
  onStart: (title: string) => Promise<void>;
  onStop: () => Promise<void>;
  error: string | null;
  initialTitle?: string;
}

export function LiveMeetingControls({
  status,
  onStart,
  onStop,
  error,
  initialTitle,
}: LiveMeetingControlsProps) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    if (!title.trim()) return;
    setIsLoading(true);
    try {
      await onStart(title.trim());
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await onStop();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <AnimatePresence mode="wait">
        {status === "idle" || status === "completed" || status === "error" ? (
          <motion.div
            key="start"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="Titre de la reunion..."
              className="px-4 py-2 rounded-xl bg-secondary/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
            />
            <button
              onClick={handleStart}
              disabled={!title.trim() || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/90 text-white text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              Demarrer
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-3"
          >
            {/* Recording indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-red-400">Enregistrement</span>
            </div>

            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/60 border border-border text-sm font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-3.5 h-3.5 fill-current" />
              )}
              Arreter
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-red-400"
        >
          {error}
        </motion.span>
      )}
    </div>
  );
}
