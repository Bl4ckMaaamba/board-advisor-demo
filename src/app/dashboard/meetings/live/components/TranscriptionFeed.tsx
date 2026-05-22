"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TranscriptionEntry } from "../hooks/useRealtimeTranscription";

const SPEAKER_COLORS: Record<string, string> = {
  speaker_0: "text-blue-400 border-blue-400/20 bg-blue-400/5",
  speaker_1: "text-emerald-400 border-emerald-400/20 bg-emerald-400/5",
  speaker_2: "text-amber-400 border-amber-400/20 bg-amber-400/5",
  speaker_3: "text-purple-400 border-purple-400/20 bg-purple-400/5",
  speaker_4: "text-rose-400 border-rose-400/20 bg-rose-400/5",
};

function getSpeakerColor(speaker: string | null): string {
  if (!speaker) return "text-muted-foreground border-border bg-secondary/20";
  return SPEAKER_COLORS[speaker] ?? "text-muted-foreground border-border bg-secondary/20";
}

function formatSpeaker(speaker: string | null): string {
  if (!speaker) return "Intervenant";
  if (!speaker.startsWith("speaker_")) return speaker;
  const num = speaker.replace("speaker_", "");
  return `Intervenant ${parseInt(num) + 1}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TranscriptionFeedProps {
  transcriptions: TranscriptionEntry[];
  isRecording: boolean;
}

export function TranscriptionFeed({ transcriptions, isRecording }: TranscriptionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions.length]);

  if (transcriptions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" />
            </div>
            En attente de parole...
          </div>
        ) : (
          "La transcription apparaitra ici en temps reel"
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1 scroll-smooth">
      <AnimatePresence initial={false}>
        {transcriptions.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`rounded-lg border px-3 py-2 ${getSpeakerColor(entry.speaker)}`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold">
                {formatSpeaker(entry.speaker)}
              </span>
              <span className="text-xs opacity-50">
                {formatTime(entry.timestamp_start)}
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {entry.content}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
