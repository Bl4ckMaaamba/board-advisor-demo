import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { generateMeetingReport } from "@/lib/reports/generate-report";

/** GET /api/meetings/[id]/report — fetch the report for this meeting if any */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("meeting_reports")
      .select("id, meeting_id, board_id, content, status, generated_at")
      .eq("meeting_id", params.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ report: null });
    return NextResponse.json({ report: data });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

/** POST /api/meetings/[id]/report — (re)generate the report from live artifacts */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, board_id")
      .eq("id", params.id)
      .single();
    if (meetingErr || !meeting) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }
    if (!meeting.board_id) {
      return NextResponse.json({ error: "Réunion sans board — impossible de générer un PV" }, { status: 400 });
    }
    const { data: membership } = await supabase
      .from("board_members")
      .select("user_id")
      .eq("board_id", meeting.board_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const result = await generateMeetingReport(params.id);
    return NextResponse.json({ report_id: result.reportId, markdown: result.markdown }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    console.error("[POST /api/meetings/[id]/report] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
