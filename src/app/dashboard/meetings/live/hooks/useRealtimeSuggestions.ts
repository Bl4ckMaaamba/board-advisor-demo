"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface SuggestionEntry {
  id: string;
  type: "deep_dive" | "question" | "action_item" | "reference";
  content: string;
  priority: "low" | "medium" | "high";
  context: string | null;
  created_at: string;
}

export function useRealtimeSuggestions(meetingId: string | null) {
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    supabase
      .from("meeting_suggestions")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setSuggestions(data);
      });

    const channel = supabase
      .channel(`suggestions-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_suggestions",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setSuggestions((prev) => [...prev, payload.new as SuggestionEntry]);
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

  return suggestions;
}
