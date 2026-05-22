import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/** GET /api/reports/[id] — fetch full report by id, with meeting + board context */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("meeting_reports")
      .select(`
        id,
        meeting_id,
        board_id,
        content,
        status,
        created_at,
        validated_at,
        meetings!inner(id, title, scheduled_at, started_at, ended_at, meeting_type),
        boards!inner(id, name)
      `)
      .eq("id", params.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Compte rendu introuvable" }, { status: 404 });

    return NextResponse.json({ report: data });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}
