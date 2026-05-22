"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface FactCheckEntry {
  id: string;
  claim: string;
  verdict: "true" | "false" | "partial" | "unverifiable" | "needs_context";
  confidence: number;
  explanation: string;
  sources: { title: string; url: string; provider: string }[];
  latency_ms: number;
  created_at: string;
}

export function useRealtimeFactChecks(meetingId: string | null) {
  const [factChecks, setFactChecks] = useState<FactCheckEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    supabase
      .from("meeting_factchecks")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setFactChecks(data);
      });

    const channel = supabase
      .channel(`factchecks-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_factchecks",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setFactChecks((prev) => [...prev, payload.new as FactCheckEntry]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [meetingId]);

  return factChecks;
}
