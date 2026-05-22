import { createSupabaseServerClient } from "@/lib/supabase-server";
import { generateQueryEmbedding, rerankWithHaiku, type ChunkResult } from "@/lib/rag";

const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
// When the user has explicitly picked docs (= scope already constrained),
// drop the threshold so even generic queries like "résume-moi ces documents"
// retrieve representative chunks instead of returning nothing.
const PICKED_DOCS_SIMILARITY_THRESHOLD = 0.0;

export async function executeSearchInternal(
  input: Record<string, unknown>,
  _boardContext?: unknown,
  documentIds?: string[],
  userId?: string
): Promise<string> {
  const query = input.query as string;
  const boardFilter = (input.board_filter as string) || null;
  const maxResults = (input.max_results as number) || 5;
  const hasPickedDocs = !!(documentIds && documentIds.length > 0);

  try {
    const supabase = createSupabaseServerClient();
    const embedding = await generateQueryEmbedding(query);

    const rpcParams: Record<string, unknown> = {
      query_embedding: JSON.stringify(embedding),
      match_count: Math.min(maxResults * 2, 10),
      match_threshold: hasPickedDocs
        ? PICKED_DOCS_SIMILARITY_THRESHOLD
        : DEFAULT_SIMILARITY_THRESHOLD,
      filter_board_id: boardFilter,
      // When the user has explicitly picked documents, the picker (which is
      // already RLS-scoped) is the source of truth — passing user_id on top
      // would re-block docs uploaded by other members of the same board.
      filter_user_id: hasPickedDocs ? null : userId ?? null,
    };

    if (hasPickedDocs) {
      rpcParams.filter_document_ids = documentIds;
    }

    const { data, error } = await supabase.rpc("match_documents", rpcParams);

    if (error) {
      return `Erreur de recherche documentaire : ${error.message}`;
    }

    const candidates: ChunkResult[] = data || [];

    if (candidates.length === 0) {
      return await diagnoseEmptyResult(supabase, documentIds);
    }

    const reranked = await rerankWithHaiku(query, candidates);
    const results = reranked.length > 0 ? reranked : candidates.slice(0, maxResults);

    return results
      .map(
        (r) =>
          `[Source : ${r.document_name}] (Pertinence : ${(r.similarity * 100).toFixed(0)}%)${r.section_title ? ` [Section : ${r.section_title}]` : ""}\n${r.content}`
      )
      .join("\n\n---\n\n");
  } catch (err) {
    return `Erreur lors de la recherche dans les documents internes : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}

/**
 * When a search returns 0 chunks while the user explicitly picked documents,
 * surface the actual reason (not indexed yet, indexing failed, no chunks at
 * all) instead of the generic "Aucun document trouvé" — which was misleading
 * the LLM into telling the user the docs were "inaccessible".
 */
async function diagnoseEmptyResult(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  documentIds: string[] | undefined
): Promise<string> {
  if (!documentIds || documentIds.length === 0) {
    return "Aucun document interne pertinent trouvé pour cette recherche.";
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, status")
    .in("id", documentIds);

  if (!docs || docs.length === 0) {
    return "Aucun document interne pertinent trouvé pour cette recherche.";
  }

  const indexed = docs.filter((d) => d.status === "indexed");
  const pending = docs.filter((d) => d.status === "pending");
  const failed = docs.filter((d) => d.status === "error");

  const lines: string[] = [
    "Aucun extrait pertinent n'a été retourné par la recherche vectorielle.",
  ];
  if (pending.length > 0) {
    lines.push(
      `${pending.length} document(s) encore en cours d'indexation : ${pending
        .map((d) => d.name)
        .join(", ")}. Réessaie dans quelques secondes.`
    );
  }
  if (failed.length > 0) {
    lines.push(
      `${failed.length} document(s) en erreur d'indexation : ${failed
        .map((d) => d.name)
        .join(", ")}. Le contenu n'a pas pu être extrait — réimporte le fichier.`
    );
  }
  if (indexed.length > 0 && pending.length === 0 && failed.length === 0) {
    lines.push(
      `Les ${indexed.length} document(s) sont indexés mais leur contenu ne ressemble pas à la requête. Reformule en utilisant des termes du document, ou demande un résumé global.`
    );
  }
  return lines.join(" ");
}
