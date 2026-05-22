/**
 * Supabase Realtime channel configuration for live meetings.
 * Used by frontend hooks to subscribe to real-time updates.
 */
export const REALTIME_CHANNELS = {
  transcriptions: (meetingId: string) => ({
    table: "meeting_transcriptions" as const,
    filter: `meeting_id=eq.${meetingId}`,
    event: "INSERT" as const,
  }),
  factchecks: (meetingId: string) => ({
    table: "meeting_factchecks" as const,
    filter: `meeting_id=eq.${meetingId}`,
    event: "INSERT" as const,
  }),
  moderations: (meetingId: string) => ({
    table: "meeting_moderations" as const,
    filter: `meeting_id=eq.${meetingId}`,
    event: "INSERT" as const,
  }),
  suggestions: (meetingId: string) => ({
    table: "meeting_suggestions" as const,
    filter: `meeting_id=eq.${meetingId}`,
    event: "INSERT" as const,
  }),
} as const;
