import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const boardId = req.nextUrl.searchParams.get("board_id");
    const meetingId = req.nextUrl.searchParams.get("meeting_id");
    const category = req.nextUrl.searchParams.get("category");

    // Base select — category may not exist yet (migration 020 pending), so we try
    // with it and fall back gracefully.
    const selectFields = "id, name, type, size, board_id, meeting_id, status, created_at, category";

    let query = supabase
      .from("documents")
      .select(selectFields)
      .eq("status", "indexed")
      .order("created_at", { ascending: false });

    if (meetingId && boardId) {
      // Meeting detail: docs uploaded TO this meeting OR board-level docs (meeting_id IS NULL)
      query = query.or(`meeting_id.eq.${meetingId},and(board_id.eq.${boardId},meeting_id.is.null)`);
    } else if (meetingId) {
      query = query.eq("meeting_id", meetingId);
    } else if (boardId) {
      query = query.eq("board_id", boardId);
    }

    if (category === "agenda") {
      query = query.eq("category", "agenda");
    } else if (category === "none") {
      query = query.is("category", null);
    }

    let { data, error } = await query;

    // If `category` column doesn't exist yet (migration 020 not applied), retry without it
    if (error && error.message?.includes("category")) {
      const fallbackSelect = "id, name, type, size, board_id, meeting_id, status, created_at";
      let fallback = supabase
        .from("documents")
        .select(fallbackSelect)
        .eq("status", "indexed")
        .order("created_at", { ascending: false });

      if (meetingId && boardId) {
        fallback = fallback.or(`meeting_id.eq.${meetingId},and(board_id.eq.${boardId},meeting_id.is.null)`);
      } else if (meetingId) {
        fallback = fallback.eq("meeting_id", meetingId);
      } else if (boardId) {
        fallback = fallback.eq("board_id", boardId);
      }

      const result = await fallback;
      data = (result.data ?? []).map((d) => ({ ...d, category: null }));
      error = result.error;
    }

    if (error) {
      console.error("[GET /api/documents] Supabase error:", error);
      throw error;
    }

    // Add null category for rows that don't have the column yet
    const documents = (data ?? []).map((d) => ({ ...d, category: d.category ?? null }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[GET /api/documents] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
