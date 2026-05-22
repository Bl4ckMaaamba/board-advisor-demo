import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/** GET /api/meetings/[id]/expert-panel — list insights */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("meeting_expert_insights")
      .select("*")
      .eq("meeting_id", params.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

/** POST /api/meetings/[id]/expert-panel — manual insight trigger */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const body = await req.json();
    const { expert_id, board_context, user_question } = body as {
      expert_id: string;
      board_context?: { name?: string; sector?: string; strategic_context?: string };
      user_question?: string;
    };

    if (!expert_id) {
      return NextResponse.json({ error: "expert_id requis" }, { status: 400 });
    }

    const trimmedQuestion = user_question?.trim() || undefined;

    // Fetch last 10 transcription segments for context
    const { data: segments } = await supabase
      .from("meeting_transcriptions")
      .select("content")
      .eq("meeting_id", params.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const recentTranscript = (segments ?? [])
      .reverse()
      .map((s: { content: string }) => s.content)
      .join(" ");

    if (!recentTranscript.trim() && !trimmedQuestion) {
      return NextResponse.json(
        { error: "Pas encore de transcription disponible." },
        { status: 422 }
      );
    }

    const { EXPERT_MAP } = await import("@/lib/live/expert/expert-registry");
    const { generateExpertInsight } = await import("@/lib/live/expert/expert-insight");
    const { getPreviousTakesText } = await import("@/lib/live/expert/expert-dedup");
    const { writeExpertInsight } = await import("@/lib/live/delivery/supabase-writer");

    const expert = EXPERT_MAP[expert_id];
    if (!expert) return NextResponse.json({ error: "Expert inconnu" }, { status: 404 });

    const previousInsights = getPreviousTakesText(expert_id);

    const insight = await generateExpertInsight({
      expert,
      boardName: board_context?.name,
      boardSector: board_context?.sector,
      boardStrategicContext: board_context?.strategic_context,
      runningSummary: "",
      recentTranscript,
      documentContext: "",
      previousInsights,
      relevanceContext: trimmedQuestion ? `Question : ${trimmedQuestion}` : "Demande manuelle",
      userQuestion: trimmedQuestion,
    });

    if (!insight) {
      return NextResponse.json(
        { error: "L'expert n'a pas d'intervention pertinente pour le moment." },
        { status: 422 }
      );
    }

    await writeExpertInsight(params.id, insight, true);
    return NextResponse.json(insight, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
