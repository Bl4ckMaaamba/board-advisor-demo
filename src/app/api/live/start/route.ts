import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { startSession } from "@/lib/live";
import { StartSessionRequestSchema } from "@/lib/live/schemas";
import { selectExpertBySector } from "@/lib/live/expert/expert-selector";

export async function POST(request: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StartSessionRequestSchema.parse(body);

    // Auto-select expert from board sector
    let expertProfile = null;
    let boardName: string | undefined;
    let boardSector: string | undefined;
    let boardStrategicContext: string | undefined;
    let memberNames: string[] = [];
    if (parsed.board_id) {
      const { data: board } = await supabase
        .from("boards")
        .select("name, sector, strategic_context")
        .eq("id", parsed.board_id)
        .single();
      if (board) {
        boardName = board.name;
        boardSector = board.sector;
        boardStrategicContext = board.strategic_context ?? undefined;
        expertProfile = selectExpertBySector(board.sector);
      }

      // Fetch board members for Deepgram Keyterm Prompting
      const { data: members } = await supabase
        .from("board_members")
        .select("user_id")
        .eq("board_id", parsed.board_id);
      if (members && members.length > 0) {
        const userIds = members.map((m: { user_id: string }) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("full_name")
          .in("id", userIds);
        memberNames = (profiles ?? [])
          .map((p: { full_name: string | null }) => p.full_name)
          .filter((name): name is string => Boolean(name));
      }
    }

    const meetingId = await startSession(
      parsed.title,
      parsed.board_id,
      parsed.config,
      user.id,
      expertProfile,
      boardName,
      boardSector,
      boardStrategicContext,
      memberNames,
      parsed.existing_meeting_id
    );

    return NextResponse.json(
      {
        meeting_id: meetingId,
        status: "recording",
        expert_id: expertProfile?.id ?? null,
        expert_name: expertProfile?.name ?? null,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
