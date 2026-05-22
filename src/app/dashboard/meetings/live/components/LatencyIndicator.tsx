"use client";

import { Activity } from "lucide-react";

interface LatencyIndicatorProps {
  avgLatencyMs: number;
  isRecording: boolean;
}

export function LatencyIndicator({ avgLatencyMs, isRecording }: LatencyIndicatorProps) {
  if (!isRecording) return null;

  const getColor = () => {
    if (avgLatencyMs === 0) return "text-muted-foreground";
    if (avgLatencyMs < 5000) return "text-emerald-400";
    if (avgLatencyMs < 8000) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className={`flex items-center gap-1.5 text-xs ${getColor()}`}>
      <Activity className="w-3.5 h-3.5" />
      <span className="font-mono">
        {avgLatencyMs > 0 ? `${(avgLatencyMs / 1000).toFixed(1)}s` : "--"}
      </span>
    </div>
  );
}
