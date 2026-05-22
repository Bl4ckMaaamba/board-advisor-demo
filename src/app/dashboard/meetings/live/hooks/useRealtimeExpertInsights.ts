"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface ExpertInsightEntry {
  id: string;
  expert_id: string;
  expert_name: string;
  take: string;
  analysis: string;
  relevance_context: string | null;
  tags: string[];
  is_manual: boolean;
  created_at: string;
}

export function useRealtimeExpertInsights(meetingId: string | null) {
  const [insights, setInsights] = useState<ExpertInsightEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    supabase
      .from("meeting_expert_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setInsights(data);
      });

    const channel = supabase
      .channel(`expert-insights-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_expert_insights",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setInsights((prev) => [...prev, payload.new as ExpertInsightEntry]);
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

  return insights;
}
