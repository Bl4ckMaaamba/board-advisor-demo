import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

interface RouteParams {
  params: { id: string };
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { user, supabase } = await getAuthenticatedUser();
    const documentId = params.id;

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "ID de document invalide" }, { status: 400 });
    }

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, user_id, board_id")
      .eq("id", documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    let canDelete = doc.user_id === user.id;

    if (!canDelete && doc.board_id) {
      const { data: membership } = await supabase
        .from("board_members")
        .select("role")
        .eq("board_id", doc.board_id)
        .eq("user_id", user.id)
        .maybeSingle();

      canDelete = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canDelete) {
      return NextResponse.json(
        { error: "Vous n'avez pas la permission de supprimer ce document" },
        { status: 403 }
      );
    }

    const { error: chunksError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    if (chunksError) {
      console.error("[DELETE /api/documents/:id] chunks error:", chunksError);
      return NextResponse.json({ error: "Erreur lors de la suppression des chunks" }, { status: 500 });
    }

    const { error: docError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (docError) {
      console.error("[DELETE /api/documents/:id] doc error:", docError);
      return NextResponse.json({ error: "Erreur lors de la suppression du document" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/documents/:id] exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const documentId = params.id;

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "ID de document invalide" }, { status: 400 });
    }

    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, type, size, board_id, meeting_id, status, created_at, user_id")
      .eq("id", documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error("[GET /api/documents/:id] exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
