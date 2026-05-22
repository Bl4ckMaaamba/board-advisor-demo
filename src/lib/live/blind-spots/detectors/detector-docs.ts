/**
 * Détecteur Type A — Documents du board pack.
 *
 * Stage 1 : recherche RAG dans les documents du board, retient les chunks à
 * fort score sémantique sur le sujet en cours.
 * Stage 2 : Sonnet décide si un angle mort mérite d'être signalé et génère
 * son contenu.
 *
 * Spec: specs/features/blind-spots.md § 8.2
 */

import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { generateQueryEmbedding } from "@/lib/rag";
import {
  STAGE2_DOCS_SYSTEM_PROMPT,
  buildDocsStage2UserPrompt,
} from "../blind-spots-prompts";
import type { BlindSpotResult, BlindSpotSourceDocs, BlindSpotStage2Output } from "../blind-spots-types";
import { liveLogger } from "../../utils/logger";

const MODEL_SONNET = "claude-sonnet-4-6";

// Stage 1 thresholds
const RAG_MATCH_COUNT = 20;
const RAG_MATCH_THRESHOLD = 0.5; // RPC seuil large
const STAGE1_MIN_CHUNK_SIMILARITY = 0.65; // chunk doit être franchement pertinent
const STAGE1_MIN_RELEVANCE_SCORE = 6; // 0-10
const TOP_K_FOR_STAGE2 = 5;

let anthropicClient: Anthropic | null = null;
function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

interface DetectDocsParams {
  meetingId: string;
  boardId: string | null;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  recentTranscript: string;
  previousEmissions: string;
  triggerQuery?: string;
  isManual?: boolean;
  triggeredByUserId?: string;
}

/**
 * Détecte un angle mort de Type A. Retourne null si :
 * - pas de board_id
 * - transcription trop courte
 * - aucun chunk pertinent trouvé
 * - score Stage 1 trop faible
 * - le LLM Stage 2 décide de ne pas émettre
 */
export async function detectDocs(params: DetectDocsParams): Promise<BlindSpotResult | null> {
  if (!params.boardId) return null;

  const transcript = params.recentTranscript.trim();
  const queryText = params.triggerQuery?.trim() || transcript;

  if (queryText.length < 50) {
    // Transcription trop courte pour être significative (sauf trigger explicite)
    return null;
  }

  // Stage 1 — RAG search
  let candidateChunks: Array<{
    chunk_id: string;
    document_id: string;
    document_name: string;
    section_title: string | null;
    content: string;
    similarity: number;
  }>;

  try {
    const embedding = await generateQueryEmbedding(queryText);
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_count: RAG_MATCH_COUNT,
      match_threshold: RAG_MATCH_THRESHOLD,
      filter_board_id: params.boardId,
      filter_document_ids: null,
      filter_user_id: null,
    });

    if (error) {
      liveLogger.error("blind-spots Stage 1 RAG error", { error: error.message });
      return null;
    }

    candidateChunks = (data ?? []).map((row: {
      id: string;
      document_id: string;
      document_name: string;
      content: string;
      section_title: string | null;
      similarity: number;
    }) => ({
      chunk_id: row.id,
      document_id: row.document_id,
      document_name: row.document_name,
      section_title: row.section_title,
      content: row.content,
      similarity: row.similarity,
    }));
  } catch (err) {
    liveLogger.error("blind-spots Stage 1 exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (candidateChunks.length === 0) return null;

  // Filtrer chunks à fort score
  const strongChunks = candidateChunks
    .filter((c) => c.similarity >= STAGE1_MIN_CHUNK_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_K_FOR_STAGE2);

  if (strongChunks.length === 0) return null;

  // Filtrage "déjà cité" : si le contenu d'un chunk apparaît textuellement
  // (même partiellement) dans la transcription, on l'écarte.
  const transcriptLower = normalize(transcript);
  const filteredChunks = strongChunks.filter((c) => !chunkAlreadyMentioned(c.content, transcriptLower));

  if (filteredChunks.length === 0) return null;

  // Score Stage 1
  const stage1Score = filteredChunks[0].similarity * 10;
  const minScore = params.isManual ? 5 : STAGE1_MIN_RELEVANCE_SCORE;
  if (stage1Score < minScore) return null;

  // Stage 2 — Sonnet décide + génère
  let stage2Output: BlindSpotStage2Output;
  try {
    const userPrompt = buildDocsStage2UserPrompt({
      recentTranscript: transcript,
      boardName: params.boardName,
      boardSector: params.boardSector,
      boardStrategicContext: params.boardStrategicContext,
      candidateChunks: filteredChunks.map((c) => ({
        chunk_id: c.chunk_id,
        document_name: c.document_name,
        section_title: c.section_title,
        content: c.content,
      })),
      previousEmissions: params.previousEmissions,
      triggerQuery: params.triggerQuery,
    });

    const response = await getAnthropic().messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: STAGE2_DOCS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      liveLogger.warn("blind-spots Stage 2 no JSON found");
      return null;
    }

    stage2Output = JSON.parse(jsonMatch[0]) as BlindSpotStage2Output & {
      source_chunk_id?: string;
      source_excerpt?: string;
    };
  } catch (err) {
    liveLogger.error("blind-spots Stage 2 exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!stage2Output.emit || !stage2Output.title || !stage2Output.description) {
    return null;
  }

  // Retrouver le chunk choisi pour construire la source
  const stage2Raw = stage2Output as BlindSpotStage2Output & {
    source_chunk_id?: string;
    source_excerpt?: string;
  };
  const sourceChunkId = stage2Raw.source_chunk_id;
  const matchedChunk = filteredChunks.find((c) => c.chunk_id === sourceChunkId) ?? filteredChunks[0];

  const source: BlindSpotSourceDocs = {
    kind: "document",
    document_id: matchedChunk.document_id,
    document_name: matchedChunk.document_name,
    chunk_id: matchedChunk.chunk_id,
    section_title: matchedChunk.section_title,
    excerpt: stage2Raw.source_excerpt?.slice(0, 250) ?? matchedChunk.content.slice(0, 250),
  };

  return {
    title: stage2Output.title.slice(0, 120),
    description: stage2Output.description.slice(0, 300),
    recommended_action: stage2Output.recommended_action,
    type: "docs",
    severity: stage2Output.severity ?? "warning",
    domain: stage2Output.domain,
    source,
    relevance_score: stage1Score,
    is_manual: params.isManual,
    triggered_by_user_id: params.triggeredByUserId,
    trigger_query: params.triggerQuery,
  };
}

/** Normalise un texte pour comparaison (lowercase, sans accents, sans ponctuation) */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Détermine si un chunk a déjà été mentionné dans la transcription.
 * Heuristique simple : on extrait des n-grams (4 mots consécutifs significatifs)
 * du chunk et on regarde si plusieurs apparaissent dans la transcription.
 */
function chunkAlreadyMentioned(chunkContent: string, normalizedTranscript: string): boolean {
  const tokens = normalize(chunkContent)
    .split(/\s+/)
    .filter((t) => t.length > 3);

  if (tokens.length < 8) return false;

  // Extraire 4-grams
  const ngrams: string[] = [];
  for (let i = 0; i + 3 < tokens.length; i++) {
    ngrams.push(tokens.slice(i, i + 4).join(" "));
  }

  // Échantillonner 10 4-grams uniformément
  const sampleSize = Math.min(10, ngrams.length);
  const step = Math.max(1, Math.floor(ngrams.length / sampleSize));
  const sampled: string[] = [];
  for (let i = 0; i < ngrams.length; i += step) {
    sampled.push(ngrams[i]);
    if (sampled.length >= sampleSize) break;
  }

  let matches = 0;
  for (const ngram of sampled) {
    if (normalizedTranscript.includes(ngram)) matches++;
  }

  // Si plus de 30% des 4-grams testés apparaissent → considéré comme abordé
  return matches / sampled.length > 0.3;
}
