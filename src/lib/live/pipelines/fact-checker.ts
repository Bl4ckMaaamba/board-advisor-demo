import Anthropic from "@anthropic-ai/sdk";
import { queryDataBroker } from "@/lib/data-broker";
import { DetectedClaim, FactCheckResult, Verdict } from "../schemas";
import { liveLogger } from "../utils/logger";
import { parseLlmJson } from "../utils/parse-llm-json";
import { evaluateImportance } from "../utils/importance-filter";
import { isDuplicate, recordPublication } from "../utils/semantic-dedup";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const DATA_BROKER_TIMEOUT_MS = 30000;

/**
 * Verify a single claim using the Data Broker + Claude synthesis.
 */
async function verifyClaim(claim: DetectedClaim): Promise<FactCheckResult | null> {
  const startTime = Date.now();

  try {
    // Query Data Broker for evidence — mode "chatbot" est plus rapide que
    // "fact_check" car il interroge moins de providers en parallèle.
    const brokerResponse = await Promise.race([
      queryDataBroker({
        query: claim.claim,
        mode: "chatbot",
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Data Broker timeout")), DATA_BROKER_TIMEOUT_MS)
      ),
    ]);

    // Extract sources from DataPackets
    const sources = brokerResponse.packets.map((p) => {
      const content = p.content as Record<string, unknown>;
      return {
        title: (content.title as string) ?? (content.name as string) ?? p.provider,
        url: (content.url as string) ?? p.source_url ?? "",
        provider: p.provider,
      };
    });

    // Synthesize verdict with Claude Haiku
    const packetsContext = brokerResponse.packets
      .slice(0, 5) // Top 5 most relevant
      .map((p) => JSON.stringify(p.content))
      .join("\n---\n");

    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Voici une affirmation à vérifier et les données trouvées par notre système de recherche.

Affirmation: "${claim.claim}"

Données trouvées:
${packetsContext || "Aucune donnée trouvée."}

Réponds UNIQUEMENT avec un JSON valide:
{
  "verdict": "true|false|partial|unverifiable|needs_context",
  "confidence": 0.0-1.0,
  "explanation": "Explication concise en 1-2 phrases"
}

Verdicts:
- true: L'affirmation est confirmée par les données
- false: L'affirmation est contredite par les données
- partial: L'affirmation est partiellement correcte
- unverifiable: Pas assez de données pour vérifier
- needs_context: L'affirmation nécessite plus de contexte`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = parseLlmJson(text);

    const latency = Date.now() - startTime;

    return {
      claim: claim.claim,
      verdict: (parsed.verdict ?? "unverifiable") as Verdict,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      explanation: parsed.explanation ?? "Analyse non disponible",
      sources,
      latency_ms: latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    liveLogger.error("Fact-check failed for claim", {
      claim: claim.claim,
      error: String(error),
      latency_ms: latency,
    });

    // En cas d'erreur ou timeout : on ne retourne PAS de fact-check
    // pour éviter d'afficher un message d'erreur dans l'UI.
    // Le claim sera retesté au prochain tour.
    return null;
  }
}

/**
 * Fact-check multiple claims in parallel with timeout.
 * Only publishes results that pass the importance filter and are not semantic
 * duplicates of recently published fact-checks for the same meeting.
 */
export async function factCheckClaims(
  claims: DetectedClaim[],
  meetingId: string,
  recentTranscript: string,
  agendaText: string,
  boardSector?: string,
): Promise<FactCheckResult[]> {
  if (claims.length === 0) return [];

  const startTime = Date.now();

  // Process claims in parallel (max 3 concurrent to avoid rate limiting)
  const results: FactCheckResult[] = [];
  const batchSize = 3;

  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(verifyClaim));

    for (let k = 0; k < batchResults.length; k++) {
      const r = batchResults[k];
      const claim = batch[k];
      if (r === null) continue;

      if (isDuplicate(meetingId, "factcheck", { tokens: claim.claim })) {
        liveLogger.info("alert_dropped", {
          pipeline: "factcheck",
          meeting_id: meetingId,
          reason: "semantic_dedup",
          candidate_summary: claim.claim.slice(0, 80),
        });
        continue;
      }

      const decision = await evaluateImportance({
        pipeline: "factcheck",
        meetingId,
        recentTranscript,
        boardSector,
        agendaText,
        candidate: claim.claim,
      });
      if (!decision.publish) continue;

      recordPublication(meetingId, "factcheck", { tokens: claim.claim });
      results.push(r);
    }
  }

  liveLogger.info("Fact-check batch complete", {
    claims: claims.length,
    results: results.length,
    latency_ms: Date.now() - startTime,
  });

  return results;
}
