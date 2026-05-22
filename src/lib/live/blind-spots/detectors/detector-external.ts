/**
 * Détecteur Type C — Signaux externes (Data Broker).
 *
 * Stage 1 : Haiku propose 0-3 requêtes ciblées
 * Stage 2 : Sonnet analyse les résultats Data Broker et décide d'émettre
 *
 * Spec: specs/features/blind-spots.md § 8.4
 */

import Anthropic from "@anthropic-ai/sdk";
import { queryDataBroker } from "@/lib/data-broker";
import type { DataPacket, ArticleContent } from "@/lib/data-broker/schemas/data-packet";
import {
  STAGE1_EXTERNAL_SYSTEM_PROMPT,
  buildExternalStage1UserPrompt,
  STAGE2_EXTERNAL_SYSTEM_PROMPT,
  buildExternalStage2UserPrompt,
} from "../blind-spots-prompts";
import type {
  BlindSpotResult,
  BlindSpotSourceExternal,
  BlindSpotStage2Output,
} from "../blind-spots-types";
import { liveLogger } from "../../utils/logger";

const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;
function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

interface DetectExternalParams {
  meetingId: string;
  boardId: string | null;
  boardName?: string;
  boardSector?: string;
  recentTranscript: string;
  previousEmissions: string;
  triggerQuery?: string;
  isManual?: boolean;
  triggeredByUserId?: string;
}

const MIN_TRANSCRIPT_LENGTH = 100;
const MAX_QUERIES = 3;
const MAX_PACKETS_FOR_STAGE2 = 8;

export async function detectExternal(
  params: DetectExternalParams
): Promise<BlindSpotResult | null> {
  const transcript = params.recentTranscript.trim();
  const queryText = params.triggerQuery?.trim() || transcript;

  if (queryText.length < MIN_TRANSCRIPT_LENGTH && !params.triggerQuery) {
    return null;
  }

  // Stage 1 — Haiku propose les requêtes
  let queries: string[];
  try {
    const stage1Response = await getAnthropic().messages.create({
      model: MODEL_HAIKU,
      max_tokens: 256,
      system: STAGE1_EXTERNAL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildExternalStage1UserPrompt({
            recentTranscript: transcript,
            boardName: params.boardName,
            boardSector: params.boardSector,
            triggerQuery: params.triggerQuery,
          }),
        },
      ],
    });

    const text = stage1Response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { queries?: string[] };
    queries = (parsed.queries ?? [])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 5)
      .slice(0, MAX_QUERIES);
  } catch (err) {
    liveLogger.warn("blind-spots external Stage 1 failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (queries.length === 0) return null;

  // Appels Data Broker en parallèle
  const boardContext =
    params.boardId && params.boardName && params.boardSector
      ? {
          board_id: params.boardId,
          name: params.boardName,
          role: "administrateur",
          sector: params.boardSector,
        }
      : undefined;

  const settled = await Promise.allSettled(
    queries.map((q) =>
      queryDataBroker({
        query: q,
        mode: "chatbot",
        board_context: boardContext,
      })
    )
  );

  const allPackets: DataPacket[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      allPackets.push(...r.value.packets);
    }
  }

  if (allPackets.length === 0) return null;

  // Filtrer les articles avec URL et fraîcheur < 90 jours (sauf si pas de date)
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const articlePackets = allPackets
    .filter((p) => {
      const c = p.content as ArticleContent;
      if (!("url" in c) || !c.url) return false;
      if (c.published_at) {
        const published = new Date(c.published_at).getTime();
        if (Number.isFinite(published) && published < ninetyDaysAgo) return false;
      }
      return true;
    })
    .slice(0, MAX_PACKETS_FOR_STAGE2);

  if (articlePackets.length === 0) return null;

  const packetsForPrompt = articlePackets.map((p) => {
    const c = p.content as ArticleContent;
    return {
      title: c.title,
      summary: c.summary,
      source_name: c.source_name,
      url: c.url,
      published_at: c.published_at,
    };
  });

  // Stage 2 — Sonnet décide + génère
  let stage2Output: BlindSpotStage2Output & { source_url?: string; source_title?: string };
  try {
    const stage2Response = await getAnthropic().messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: STAGE2_EXTERNAL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildExternalStage2UserPrompt({
            recentTranscript: transcript,
            boardName: params.boardName,
            boardSector: params.boardSector,
            packets: packetsForPrompt,
            previousEmissions: params.previousEmissions,
            triggerQuery: params.triggerQuery,
          }),
        },
      ],
    });

    const text = stage2Response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    stage2Output = JSON.parse(jsonMatch[0]);
  } catch (err) {
    liveLogger.warn("blind-spots external Stage 2 failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!stage2Output.emit || !stage2Output.title || !stage2Output.description) {
    return null;
  }

  // L'URL doit exister dans les résultats fournis (anti-hallucination)
  const sourceUrl = stage2Output.source_url;
  if (!sourceUrl) return null;
  const matchedPacket = articlePackets.find((p) => {
    const c = p.content as ArticleContent;
    return c.url === sourceUrl;
  });

  if (!matchedPacket) {
    liveLogger.warn("blind-spots external Stage 2 cited unknown URL", { url: sourceUrl });
    return null;
  }

  const matchedContent = matchedPacket.content as ArticleContent;
  const source: BlindSpotSourceExternal = {
    kind: "web",
    url: matchedContent.url,
    title: stage2Output.source_title ?? matchedContent.title,
    published_at: matchedContent.published_at ?? undefined,
    provider: matchedPacket.provider,
  };

  return {
    title: stage2Output.title.slice(0, 120),
    description: stage2Output.description.slice(0, 300),
    recommended_action: stage2Output.recommended_action,
    type: "external",
    severity: stage2Output.severity ?? "warning",
    domain: stage2Output.domain,
    source,
    relevance_score: 7, // arbitraire, le filtrage Stage 1 + Stage 2 a déjà gardé le pertinent
    is_manual: params.isManual,
    triggered_by_user_id: params.triggeredByUserId,
    trigger_query: params.triggerQuery,
  };
}
