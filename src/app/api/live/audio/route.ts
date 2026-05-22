import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { processAudioChunk } from "@/lib/live";
import { AudioChunkRequestSchema } from "@/lib/live/schemas";

export async function POST(request: NextRequest) {
  let user;
  try {
    ({ user } = await getAuthenticatedUser());
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = AudioChunkRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: String(error) },
      { status: 400 }
    );
  }

  // The participant_id must match the authenticated user — a client can only
  // stream its own mic. Spoofing another user's id is rejected.
  if (parsed.participant_id !== user.id) {
    return NextResponse.json(
      { error: "participant_id ne correspond pas à l'utilisateur authentifié" },
      { status: 403 }
    );
  }

  // Fire-and-forget: route the PCM16 chunk to this participant's Deepgram WS.
  processAudioChunk(parsed.meeting_id, parsed.participant_id, parsed.chunk).catch(
    (err) => {
      console.error("Audio processing error:", err);
    }
  );

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
