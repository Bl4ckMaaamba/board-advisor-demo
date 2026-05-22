import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { getSessionState, getActiveSessions, getConnectedMics } from "@/lib/live";

export async function GET(request: NextRequest) {
  try {
    await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const meetingId = request.nextUrl.searchParams.get("meeting_id");

  if (meetingId) {
    const state = getSessionState(meetingId);
    if (!state) {
      return NextResponse.json(
        { error: "No active session found for this meeting" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ...state,
      connected_mics: getConnectedMics(meetingId),
    });
  }

  // Return all active sessions
  const activeSessions = getActiveSessions();
  return NextResponse.json({
    active_sessions: activeSessions.length,
    session_ids: activeSessions,
  });
}
