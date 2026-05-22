import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/**
 * PATCH /api/meetings/[id] — Update meeting fields (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify caller is admin of this meeting
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, admin_user_id, board_id")
      .eq("id", id)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: "Reunion introuvable" }, { status: 404 });
    }

    if (meeting.admin_user_id !== user.id) {
      return NextResponse.json({ error: "Seul l'admin peut modifier la reunion" }, { status: 403 });
    }

    // Only allow safe fields to be updated
    const allowedFields: Record<string, unknown> = {};
    if (body.meeting_url !== undefined) allowedFields.meeting_url = body.meeting_url;
    if (body.title !== undefined) allowedFields.title = body.title;
    if (body.scheduled_at !== undefined) allowedFields.scheduled_at = body.scheduled_at;
    if (body.agenda !== undefined) allowedFields.agenda = body.agenda;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: "Aucun champ a modifier" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("meetings")
      .update(allowedFields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meeting: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
