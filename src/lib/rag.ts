const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4";
const EMBEDDING_DIMS = 1024;

// --- Chunking ---

const CHUNK_SIZE = 4000; // ~1000 tokens FR — sections logiques complètes
const CHUNK_OVERLAP = 500; // ~125 tokens

// Patterns for detecting section headers in board documents
const SECTION_PATTERNS = [
  /^#{1,3}\s+.+/,                    // Markdown headers
  /^Article\s+\d+/i,                 // Article 1, Article 2...
  /^\d+\.\s+[A-Z]/,                 // 1. Title, 2. Title...
  /^[IVXLC]+\.\s+/,                 // I. II. III. IV...
  /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s]{5,}$/m, // FULL CAPS TITLES
  /^Résolution\s+/i,                 // Résolution 1, Résolution n°2...
  /^Chapitre\s+/i,                   // Chapitre 1...
  /^Titre\s+/i,                      // Titre I...
  /^Annexe\s+/i,                     // Annexe A...
];

function detectSectionTitle(text: string): string | null {
  const firstLine = text.split("\n")[0].trim();
  for (const pattern of SECTION_PATTERNS) {
    if (pattern.test(firstLine)) {
      return firstLine.replace(/^#{1,3}\s+/, "").trim();
    }
  }
  return null;
}

export interface ChunkedText {
  content: string;
  sectionTitle: string | null;
}

export function chunkText(text: string): ChunkedText[] {
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= CHUNK_SIZE) {
    return [{ content: cleaned, sectionTitle: detectSectionTitle(cleaned) }];
  }

  const chunks: ChunkedText[] = [];
  let start = 0;
  let currentSection: string | null = null;

  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE;

    if (end < cleaned.length) {
      // Recursive separator search: \n\n → \n → ". " → " "
      const separators = ["\n\n", "\n", ". ", " "];
      let found = false;
      for (const sep of separators) {
        const lastSep = cleaned.lastIndexOf(sep, end);
        if (lastSep > start + CHUNK_SIZE / 2) {
          end = lastSep + sep.length;
          found = true;
          break;
        }
      }
      if (!found) {
        end = Math.min(start + CHUNK_SIZE, cleaned.length);
      }
    } else {
      end = cleaned.length;
    }

    const chunkContent = cleaned.slice(start, end).trim();

    // Detect section title from this chunk
    const detectedTitle = detectSectionTitle(chunkContent);
    if (detectedTitle) {
      currentSection = detectedTitle;
    }

    if (chunkContent.length > 20) {
      // Prefix chunk with section context if available
      const prefixedContent = currentSection
        ? `[Section: ${currentSection}]\n${chunkContent}`
        : chunkContent;

      chunks.push({
        content: prefixedContent,
        sectionTitle: currentSection,
      });
    }

    const nextStart = end - CHUNK_OVERLAP;
    start = nextStart <= start ? end : nextStart;
  }

  return chunks;
}

// --- Voyage 4 Embeddings ---

function getVoyageApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

async function callVoyageAPI(
  input: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getVoyageApiKey()}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${error}`);
  }

  const result: VoyageEmbeddingResponse = await response.json();
  return result.data.map((d) => d.embedding);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 128; // Voyage supports up to 128 texts per call
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await callVoyageAPI(batch, "document");
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await callVoyageAPI([query], "query");
  return embeddings[0];
}

// --- Reranking with Claude Haiku ---

import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export interface ChunkResult {
  id: string;
  document_id: string;
  document_name: string;
  content: string;
  similarity: number;
  section_title?: string | null;
}

export async function rerankWithHaiku(
  query: string,
  chunks: ChunkResult[]
): Promise<ChunkResult[]> {
  if (chunks.length === 0) return [];

  const chunkList = chunks
    .map((c, i) => `[${i}] (Source: ${c.document_name})\n${c.content.substring(0, 800)}`)
    .join("\n\n---\n\n");

  const message = await getAnthropicClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system:
      `Tu es un évaluateur de pertinence pour des documents de conseil d'administration. Pour chaque extrait, donne un score de 0 à 10 selon cette échelle :
- 0-2 : Hors sujet (aucun lien avec la question)
- 3-4 : Contexte général (même domaine, pas de réponse directe)
- 5-6 : Partiellement pertinent (aborde le sujet, pas la question spécifique)
- 7-8 : Pertinent (répond directement à un aspect de la question)
- 9-10 : Très pertinent (réponse directe et complète)
Réponds UNIQUEMENT au format JSON: {"scores": [score0, score1, ...]}`,
    messages: [
      {
        role: "user",
        content: `Question: ${query}\n\nExtraits:\n\n${chunkList}`,
      },
    ],
  });

  try {
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);
    const scores: number[] = parsed.scores;

    const scored = chunks
      .map((chunk, i) => ({ ...chunk, rerankScore: scores[i] ?? 0 }))
      .sort((a, b) => b.rerankScore - a.rerankScore);

    const filtered = scored.filter((c) => c.rerankScore >= 4);

    // Fallback: if ALL results are below threshold, return top 3 best-of
    if (filtered.length === 0) {
      return scored.slice(0, 3);
    }

    return filtered.slice(0, 8);
  } catch {
    console.warn("[RAG] Reranking parse failed, returning vector results");
    return chunks.slice(0, 6);
  }
}
