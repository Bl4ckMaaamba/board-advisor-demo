"use client";

import { useMemo } from "react";
import type { TranscriptionEntry } from "../hooks/useRealtimeTranscription";

const SPEAKER_COLORS = [
  "bg-blue-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-purple-400",
  "bg-rose-400",
];

interface SpeakerStatsProps {
  transcriptions: TranscriptionEntry[];
}

export function SpeakerStats({ transcriptions }: SpeakerStatsProps) {
  const stats = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transcriptions) {
      const speaker = t.speaker ?? "unknown";
      const duration = t.timestamp_end - t.timestamp_start;
      map.set(speaker, (map.get(speaker) ?? 0) + duration);
    }

    const entries = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, d]) => sum + d, 0);

    return entries.map(([speaker, duration], i) => ({
      speaker,
      duration,
      ratio: total > 0 ? duration / total : 0,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
      label: speaker === "unknown"
        ? "Inconnu"
        : speaker.startsWith("speaker_")
          ? `Intervenant ${parseInt(speaker.replace("speaker_", "")) + 1}`
          : speaker,
    }));
  }, [transcriptions]);

  if (stats.length === 0) return null;

  return (
    <div className="flex items-center gap-4">
      {/* Bar */}
      <div className="flex-1 h-2 rounded-full bg-secondary/40 overflow-hidden flex">
        {stats.map((s) => (
          <div
            key={s.speaker}
            className={`h-full ${s.color} transition-all duration-500`}
            style={{ width: `${s.ratio * 100}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 shrink-0">
        {stats.map((s) => (
          <div key={s.speaker} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-xs text-muted-foreground">
              {s.label} ({Math.round(s.ratio * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
