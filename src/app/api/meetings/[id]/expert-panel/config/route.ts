import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/** GET /api/meetings/[id]/expert-panel/config */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("meeting_expert_config")
      .select("*")
      .eq("meeting_id", params.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? null);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
}

/** PUT /api/meetings/[id]/expert-panel/config */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const body = await req.json();
    const { primary_expert_id, additional_expert_ids, auto_selected } = body as {
      primary_expert_id: string;
      additional_expert_ids?: string[];
      auto_selected?: boolean;
    };

    if (!primary_expert_id) {
      return NextResponse.json({ error: "primary_expert_id requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("meeting_expert_config")
      .upsert(
        {
          meeting_id: params.id,
          primary_expert_id,
          additional_expert_ids: additional_expert_ids ?? [],
          auto_selected: auto_selected ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "meeting_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

/** PATCH /api/meetings/[id]/expert-panel/config — obsolète, mode auto supprimé */
export async function PATCH() {
  return NextResponse.json(
    { success: true, message: "Le mode auto a été supprimé — le panel expert est exclusivement manuel." },
    { status: 200 }
  );
}
