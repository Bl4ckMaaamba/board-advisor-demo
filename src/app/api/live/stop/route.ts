import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { stopSession } from "@/lib/live";
import { StopSessionRequestSchema } from "@/lib/live/schemas";
import { generateMeetingReport } from "@/lib/reports/generate-report";

export async function POST(request: NextRequest) {
  try {
    try {
      await getAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StopSessionRequestSchema.parse(body);

    await stopSession(parsed.meeting_id);

    // Fire-and-forget: generate the meeting report from live artifacts.
    void generateMeetingReport(parsed.meeting_id).catch((err) => {
      console.error("[stop] Report generation failed:", err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ status: "completed" });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: String(error) },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
