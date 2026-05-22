import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { runBlindSpotsPipeline } from "@/lib/live/pipelines/blind-spots";
import { writeBlindSpot } from "@/lib/live/delivery/supabase-writer";
import { getBlindSpotsContext } from "@/lib/live/orchestrator";

interface RouteParams {
  params: { id: string };
}

/** GET /api/meetings/[id]/blind-spots — historique des angles morts pour cette réunion */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("meeting_blind_spots")
      .select("*")
      .eq("meeting_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ blind_spots: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

/** POST /api/meetings/[id]/blind-spots — déclenchement manuel d'une analyse */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { user, supabase } = await getAuthenticatedUser();
    const meetingId = params.id;

    // Vérifier que l'utilisateur est membre du board de la meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, board_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
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

    const body = await req.json().catch(() => ({}));
    const triggerQuery: string | undefined = body.trigger_query?.trim() || undefined;

    // Récupérer le contexte de la session active si elle existe,
    // sinon reconstruire depuis la base (cas où la réunion est en pause/terminée)
    let ctx = getBlindSpotsContext(meetingId);

    if (!ctx) {
      // Fallback : reconstituer depuis les dernières transcriptions DB
      const { data: segments } = await supabase
        .from("meeting_transcriptions")
        .select("content")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false })
        .limit(15);

      const recentTranscript = (segments ?? [])
        .reverse()
        .map((s: { content: string }) => s.content)
        .join(" ");

      let boardName: string | undefined;
      let boardSector: string | undefined;
      let boardStrategicContext: string | undefined;
      if (meeting.board_id) {
        const { data: board } = await supabase
          .from("boards")
          .select("name, sector, company_strategic_context")
          .eq("id", meeting.board_id)
          .single();
        if (board) {
          boardName = board.name ?? undefined;
          boardSector = board.sector ?? undefined;
          boardStrategicContext = board.company_strategic_context ?? undefined;
        }
      }

      ctx = {
        boardId: meeting.board_id ?? null,
        boardName,
        boardSector,
        boardStrategicContext,
        recentTranscript,
      };
    }

    if (!ctx.recentTranscript.trim() && !triggerQuery) {
      // Pas d'erreur — on retourne juste 0 résultat avec un message explicite
      return NextResponse.json({
        emitted: 0,
        spots: [],
        message:
          "Pas encore de transcription disponible. Activez votre micro et faites parler quelqu'un, ou saisissez une question explicite.",
      });
    }

    const spots = await runBlindSpotsPipeline({
      meetingId,
      boardId: ctx.boardId,
      boardName: ctx.boardName,
      boardSector: ctx.boardSector,
      boardStrategicContext: ctx.boardStrategicContext,
      recentTranscript: ctx.recentTranscript,
      triggerQuery,
      triggeredByUserId: user.id,
      // En manuel : on active les 3 détecteurs (docs, mémoire, externe)
      enabledDetectors: { docs: true, memory: true, external: true },
    });

    for (const spot of spots) {
      await writeBlindSpot(meetingId, spot);
    }

    return NextResponse.json({ emitted: spots.length, spots });
  } catch (error) {
    console.error("[POST /api/meetings/:id/blind-spots]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
