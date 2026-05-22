import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { extractText } from "@/lib/extract-text";
import { chunkText, generateEmbeddings } from "@/lib/rag";

async function indexDocument(supabase: SupabaseClient, docId: string, buffer: Buffer, extension: string) {
  try {
    // 1. Extract text
    console.log(`[RAG] Extracting text (${extension})...`);
    const text = await extractText(buffer, extension);
    if (!text || text.trim().length < 10) {
      await supabase.from("documents").update({ status: "error" }).eq("id", docId);
      console.error(`[RAG] Text too short for doc ${docId}`);
      return;
    }
    console.log(`[RAG] Text extracted: ${text.length} chars`);

    // 2. Chunk text (with section titles)
    const chunks = chunkText(text);
    console.log(`[RAG] ${chunks.length} chunks created`);

    // 3. Generate embeddings via Voyage 4
    const chunkContents = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(chunkContents);
    console.log(`[RAG] ${embeddings.length} embeddings generated (Voyage 4, 1024 dims)`);

    // 4. Store chunks with embeddings and section titles
    const rows = chunks.map((chunk, i) => ({
      document_id: docId,
      content: chunk.content,
      section_title: chunk.sectionTitle,
      chunk_index: i,
      embedding: JSON.stringify(embeddings[i]),
    }));

    const { error: chunkError } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (chunkError) {
      console.error(`[RAG] Chunk insert error:`, chunkError.message);
      await supabase.from("documents").update({ status: "error" }).eq("id", docId);
      return;
    }

    // 5. Mark as indexed
    await supabase.from("documents").update({ status: "indexed" }).eq("id", docId);
    console.log(`[RAG] Document ${docId} indexed successfully`);
  } catch (err) {
    console.error(`[RAG] Indexation error for ${docId}:`, err instanceof Error ? err.message : err);
    await supabase.from("documents").update({ status: "error" }).eq("id", docId);
  }
}

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const boardId = formData.get("board_id") as string | null;
    const meetingId = formData.get("meetingId") as string | null;
    const category = formData.get("category") as string | null;
    const uploadedBy = user.user_metadata?.full_name ?? user.email ?? "Utilisateur";

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toUpperCase() || "TXT";
    const buffer = Buffer.from(await file.arrayBuffer());

    // Insert document with status 'pending'.
    // Include `category` only if the column exists (migration 020). If not, fall back silently.
    const baseFields = {
      name: file.name,
      type: extension,
      size: file.size,
      board_id: boardId,
      meeting_id: meetingId,
      uploaded_by: uploadedBy,
      user_id: user.id,
      status: "pending",
    };

    let insertResult = await supabase
      .from("documents")
      .insert(category ? { ...baseFields, category } : baseFields)
      .select()
      .single();

    // Migration 020 not yet applied: retry without category
    if (insertResult.error && category) {
      insertResult = await supabase
        .from("documents")
        .insert(baseFields)
        .select()
        .single();
    }

    const { data: doc, error: docError } = insertResult;

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    // Launch indexation in background (non-awaited)
    indexDocument(supabase, doc.id, buffer, extension);

    // Return immediately
    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: file.name,
        status: "pending",
        type: extension,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
