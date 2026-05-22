"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface TranscriptionEntry {
  id: string;
  speaker: string | null;
  content: string;
  timestamp_start: number;
  timestamp_end: number;
  confidence: number;
  chunk_index: number;
  created_at: string;
}

export function useRealtimeTranscription(meetingId: string | null) {
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    // Load existing transcriptions
    supabase
      .from("meeting_transcriptions")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("timestamp_start", { ascending: true })
      .then(({ data }) => {
        if (data) setTranscriptions(data);
      });

    // Subscribe to new inserts
    const channel = supabase
      .channel(`transcriptions-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_transcriptions",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setTranscriptions((prev) => [...prev, payload.new as TranscriptionEntry]);
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

  return transcriptions;
}
