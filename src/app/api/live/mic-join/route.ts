import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { joinMic } from "@/lib/live";
import { MicJoinRequestSchema } from "@/lib/live/schemas";

export async function POST(request: NextRequest) {
  let supabase, user;
  try {
    ({ supabase, user } = await getAuthenticatedUser());
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = MicJoinRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: String(error) },
      { status: 400 }
    );
  }

  // Authorization: rely on RLS — fetching the meeting with the user's session
  // returns a row only if the user is a board member, the meeting owner (for
  // standalone meetings), or an explicit meeting participant.
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", parsed.meeting_id)
    .maybeSingle();

  if (meetingError || !meeting) {
    return NextResponse.json(
      { error: "Réunion introuvable ou accès refusé" },
      { status: 403 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.full_name?.trim() || user.email || "Participant";

  try {
    await joinMic(parsed.meeting_id, user.id, displayName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    status: "joined",
    participant_id: user.id,
    display_name: displayName,
  });
}
