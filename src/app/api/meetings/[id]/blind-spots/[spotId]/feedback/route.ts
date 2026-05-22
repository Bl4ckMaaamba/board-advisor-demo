import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

interface RouteParams {
  params: { id: string; spotId: string };
}

/** POST /api/meetings/[id]/blind-spots/[spotId]/feedback — upsert thumbs up/down */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { user, supabase } = await getAuthenticatedUser();
    const { id: meetingId, spotId } = params;

    const body = await req.json();
    const rating = body.rating;
    if (rating !== 1 && rating !== -1) {
      return NextResponse.json({ error: "rating must be 1 or -1" }, { status: 400 });
    }

    // Verify membership
    const { data: meeting } = await supabase
      .from("meetings")
      .select("board_id")
      .eq("id", meetingId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }

    if (meeting.board_id) {
      const { data: membership } = await supabase
        .from("board_members")
        .select("user_id")
        .eq("board_id", meeting.board_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    // Upsert: ON CONFLICT (blind_spot_id, user_id) update rating
    const { error } = await supabase.from("blind_spot_feedback").upsert(
      {
        blind_spot_id: spotId,
        meeting_id: meetingId,
        user_id: user.id,
        rating,
      },
      { onConflict: "blind_spot_id,user_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rating });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

/** GET /api/meetings/[id]/blind-spots/[spotId]/feedback — get current user's vote */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { user, supabase } = await getAuthenticatedUser();
    const { spotId } = params;

    const { data } = await supabase
      .from("blind_spot_feedback")
      .select("rating")
      .eq("blind_spot_id", spotId)
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ rating: data?.rating ?? null });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}
