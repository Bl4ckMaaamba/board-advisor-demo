"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface ModerationEntry {
  id: string;
  type: "tone" | "interruption" | "speaking_time" | "off_topic" | "conflict";
  severity: "info" | "warning" | "alert";
  message: string;
  speaker: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export function useRealtimeModeration(meetingId: string | null) {
  const [moderations, setModerations] = useState<ModerationEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    supabase
      .from("meeting_moderations")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setModerations(data);
      });

    const channel = supabase
      .channel(`moderations-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_moderations",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setModerations((prev) => [...prev, payload.new as ModerationEntry]);
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

  return moderations;
}
