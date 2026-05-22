import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { leaveMic } from "@/lib/live";
import { MicLeaveRequestSchema } from "@/lib/live/schemas";

export async function POST(request: NextRequest) {
  let user;
  try {
    ({ user } = await getAuthenticatedUser());
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = MicLeaveRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: String(error) },
      { status: 400 }
    );
  }

  // leaveMic only closes the participant's own stream — no privilege escalation
  // possible because the participant_id is taken from the authenticated user_id,
  // never from the request body.
  await leaveMic(parsed.meeting_id, user.id);

  return NextResponse.json({ status: "left" });
}
