import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/**
 * POST /api/meetings — Create a new meeting
 * Only board admin/owner can create meetings for a board.
 */
export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { title, board_id, scheduled_at, meeting_type, meeting_url, agenda } = await req.json();

    if (!title || !board_id) {
      return NextResponse.json({ error: "title et board_id requis" }, { status: 400 });
    }

    // Validate visio fields
    if (meeting_type === "visio" && !meeting_url) {
      return NextResponse.json({ error: "meeting_url requis pour une réunion visio" }, { status: 400 });
    }

    // Verify caller is admin/owner of this board
    const { data: callerMember } = await supabase
      .from("board_members")
      .select("role")
      .eq("board_id", board_id)
      .eq("user_id", user.id)
      .single();

    if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
      return NextResponse.json({ error: "Seul un admin peut creer une reunion" }, { status: 403 });
    }

    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({
        title,
        board_id,
        user_id: user.id,
        admin_user_id: user.id,
        status: "idle",
        meeting_type: meeting_type || "in_person",
        ...(scheduled_at && { scheduled_at }),
        ...(meeting_url && { meeting_url }),
        agenda: agenda ?? [],
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/meetings] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const boardId = req.nextUrl.searchParams.get("board_id");

    let query = supabase
      .from("meetings")
      .select("id, title, board_id, status, started_at, ended_at, scheduled_at, config, user_id, admin_user_id, created_at, meeting_type, meeting_url, recall_bot_id, recall_bot_status, agenda")
      .order("created_at", { ascending: false });

    if (boardId) {
      query = query.eq("board_id", boardId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/meetings] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meetings: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
