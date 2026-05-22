"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { BlindSpotEntry } from "@/lib/live/blind-spots";

export type { BlindSpotEntry };

export function useRealtimeBlindSpots(meetingId: string | null) {
  const [spots, setSpots] = useState<BlindSpotEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!meetingId) {
      setSpots([]);
      return;
    }

    let cancelled = false;

    supabase
      .from("meeting_blind_spots")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setSpots(data as BlindSpotEntry[]);
      });

    const channel = supabase
      .channel(`blind-spots-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_blind_spots",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setSpots((prev) => [...prev, payload.new as BlindSpotEntry]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [meetingId]);

  return spots;
}
