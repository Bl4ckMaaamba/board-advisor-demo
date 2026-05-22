import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { stopBot } from "@/lib/live/recall/recall-client";
import { stopSession } from "@/lib/live";
import { generateMeetingReport } from "@/lib/reports/generate-report";
import { z } from "zod/v4";

const StopVisioSchema = z.object({
  meeting_id: z.string().uuid(),
});

/**
 * POST /api/live/stop-visio — Stop a visio live session
 * Removes the Recall.ai bot from the call and stops the session.
 */
export async function POST(request: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StopVisioSchema.parse(body);

    // Fetch meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, recall_bot_id, admin_user_id, meeting_type")
      .eq("id", parsed.meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }

    if (meeting.admin_user_id !== user.id) {
      return NextResponse.json({ error: "Seul l'admin peut arrêter la réunion" }, { status: 403 });
    }

    // Stop Recall.ai bot if exists
    if (meeting.recall_bot_id) {
      try {
        await stopBot(meeting.recall_bot_id);
      } catch (err) {
        console.warn("[stop-visio] Failed to stop Recall bot:", err);
      }
    }

    // Stop the orchestrator session
    try {
      await stopSession(parsed.meeting_id);
    } catch (err) {
      console.warn("[stop-visio] Failed to stop session:", err);
    }

    // Update meeting status
    await supabase
      .from("meetings")
      .update({
        status: "completed",
        recall_bot_status: "done",
        ended_at: new Date().toISOString(),
      })
      .eq("id", parsed.meeting_id);

    // Fire-and-forget: generate the meeting report from live artifacts.
    void generateMeetingReport(parsed.meeting_id).catch((err) => {
      console.error("[stop-visio] Report generation failed:", err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ status: "completed" });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: String(error) },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/live/stop-visio] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
