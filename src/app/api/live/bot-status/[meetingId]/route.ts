import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/**
 * GET /api/live/bot-status/[meetingId] — Get Recall.ai bot status
 * Returns the current recall_bot_status from the database.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { meetingId } = await params;

    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("id, recall_bot_id, recall_bot_status, meeting_type, status")
      .eq("id", meetingId)
      .single();

    if (error || !meeting) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      meeting_id: meeting.id,
      meeting_type: meeting.meeting_type,
      meeting_status: meeting.status,
      recall_bot_id: meeting.recall_bot_id,
      recall_bot_status: meeting.recall_bot_status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
