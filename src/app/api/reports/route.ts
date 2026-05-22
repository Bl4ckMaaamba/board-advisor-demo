import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/**
 * GET /api/reports — list all reports the current user can see (RLS-scoped to
 * boards they're a member of). Joins minimal meeting + board info needed by
 * the listing page.
 */
export async function GET() {
  try {
    const { supabase } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("meeting_reports")
      .select(`
        id,
        meeting_id,
        board_id,
        status,
        created_at,
        validated_at,
        meetings!inner(id, title, scheduled_at, started_at, meeting_type),
        boards!inner(id, name)
      `)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ reports: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}
