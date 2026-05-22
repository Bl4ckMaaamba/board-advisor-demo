import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { createBot, stopBot } from "@/lib/live/recall/recall-client";
import { startVisioSession, stopSession } from "@/lib/live";
import { selectExpertBySector } from "@/lib/live/expert/expert-selector";
import { z } from "zod/v4";

const StartVisioSchema = z.object({
  meeting_id: z.string().uuid(),
});

/**
 * POST /api/live/start-visio — Start a visio live session
 * Creates a Recall.ai bot that joins the meeting URL, then starts
 * a passive session waiting for transcription webhooks.
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
    const parsed = StartVisioSchema.parse(body);

    // Fetch meeting to get URL and verify access
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, board_id, meeting_url, meeting_type, admin_user_id, status, recall_bot_id")
      .eq("id", parsed.meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }

    if (meeting.meeting_type !== "visio") {
      return NextResponse.json({ error: "Cette réunion n'est pas en mode visio" }, { status: 400 });
    }

    if (!meeting.meeting_url) {
      return NextResponse.json({ error: "Aucune URL de visioconférence configurée" }, { status: 400 });
    }

    if (meeting.admin_user_id !== user.id) {
      return NextResponse.json({ error: "Seul l'admin de la réunion peut la lancer" }, { status: 403 });
    }

    // If a previous session is still marked as recording, clean it up
    // (happens when the visio call ended externally without stopping via the app)
    if (meeting.status === "recording") {
      console.log("[start-visio] Previous session still recording — stopping old bot and session");
      if (meeting.recall_bot_id) {
        await stopBot(meeting.recall_bot_id).catch((err: unknown) => {
          console.warn("[start-visio] Failed to stop old Recall bot:", err);
        });
      }
      await stopSession(parsed.meeting_id).catch((err: unknown) => {
        console.warn("[start-visio] Failed to stop old session:", err);
      });
      await supabase
        .from("meetings")
        .update({ status: "idle", recall_bot_id: null, recall_bot_status: null })
        .eq("id", parsed.meeting_id);
    }

    // Build the webhook URL for Recall.ai
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const webhookUrl = `${baseUrl}/api/live/webhook`;

    // Create Recall.ai bot
    const { botId } = await createBot(
      meeting.meeting_url,
      "Board Advisor",
      webhookUrl
    );

    // Update meeting with bot info
    await supabase
      .from("meetings")
      .update({
        recall_bot_id: botId,
        recall_bot_status: "joining",
        status: "recording",
      })
      .eq("id", parsed.meeting_id);

    // Auto-select expert from board sector
    let expertProfile = null;
    let boardName: string | undefined;
    let boardSector: string | undefined;
    let boardStrategicContext: string | undefined;
    if (meeting.board_id) {
      const { data: board } = await supabase
        .from("boards")
        .select("name, sector, strategic_context")
        .eq("id", meeting.board_id)
        .single();
      if (board) {
        boardName = board.name;
        boardSector = board.sector;
        boardStrategicContext = board.strategic_context ?? undefined;
        expertProfile = selectExpertBySector(board.sector);
      }
    }

    // Start passive visio session in orchestrator
    await startVisioSession(
      parsed.meeting_id,
      botId,
      undefined,
      expertProfile,
      boardName,
      boardSector,
      boardStrategicContext,
      meeting.board_id ?? undefined
    );

    return NextResponse.json(
      {
        meeting_id: parsed.meeting_id,
        recall_bot_id: botId,
        status: "joining",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: String(error) },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/live/start-visio] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
