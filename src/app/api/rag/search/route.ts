import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { generateQueryEmbedding, rerankWithHaiku, type ChunkResult } from "@/lib/rag";

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { query, board, matchCount = 10 } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query manquante" }, { status: 400 });
    }

    // 1. Generate embedding for query (Voyage 4, input_type: "query")
    const embedding = await generateQueryEmbedding(query);

    // 2. Vector search — retrieve top 10 candidates with threshold 0.5
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: JSON.stringify(embedding),
      match_count: matchCount,
      match_threshold: 0.5,
      filter_board_id: board || null,
      filter_user_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates: ChunkResult[] = data || [];

    if (candidates.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 3. Rerank with Claude Haiku — keep top 4 with score >= 6
    const reranked = await rerankWithHaiku(query, candidates);

    return NextResponse.json({ results: reranked });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[RAG Search] Error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
