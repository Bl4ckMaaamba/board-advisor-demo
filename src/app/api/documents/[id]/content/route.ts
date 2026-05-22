import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { supabase } = await getAuthenticatedUser();
    const documentId = params.id;

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "ID de document invalide" }, { status: 400 });
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, name, type, size, status, created_at")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("content, section_title, chunk_index")
      .eq("document_id", documentId)
      .order("chunk_index", { ascending: true });

    if (chunksError) {
      console.error("[GET /api/documents/:id/content] chunks error:", chunksError);
      return NextResponse.json({ error: "Erreur lors de la lecture du contenu" }, { status: 500 });
    }

    const sections: { title: string | null; content: string }[] = [];
    let currentTitle: string | null = null;
    let currentContent: string[] = [];

    for (const chunk of chunks ?? []) {
      const title = chunk.section_title ?? null;
      if (title !== currentTitle) {
        if (currentContent.length > 0) {
          sections.push({ title: currentTitle, content: currentContent.join("\n\n") });
        }
        currentTitle = title;
        currentContent = [chunk.content];
      } else {
        currentContent.push(chunk.content);
      }
    }
    if (currentContent.length > 0) {
      sections.push({ title: currentTitle, content: currentContent.join("\n\n") });
    }

    return NextResponse.json({
      document: doc,
      sections,
      chunkCount: chunks?.length ?? 0,
    });
  } catch (error) {
    console.error("[GET /api/documents/:id/content] exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
