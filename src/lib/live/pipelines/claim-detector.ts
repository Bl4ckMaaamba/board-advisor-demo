import Anthropic from "@anthropic-ai/sdk";
import { TranscriptionSegment, DetectedClaim } from "../schemas";
import { liveLogger } from "../utils/logger";
import { parseLlmJson } from "../utils/parse-llm-json";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Pre-filter patterns that suggest a verifiable claim.
// Each pattern targets a concrete, fact-checkable signal (numbers, named
// entities, declared actions). Generic copulas like "c'est" / "est le" are
// intentionally NOT included — they match anything and produce noise.
const CLAIM_PATTERNS = [
  // Numeric & financial signals
  /\d+[\s,.]?\d*\s*(%|pourcent|pour cent|percent)/i,
  /\d+[\s,.]?\d*\s*(milliard|million|billion|trillion|mille)/i,
  /\d+[\s,.]?\d*\s*(€|euro|euros|dollar|dollars|\$|£)/i,
  /\b(chiffre d'affaires|ebitda|marge brute|marge nette|résultat net|résultat opérationnel)\b/i,
  /\b(en \d{4}|depuis \d{4}|au \d+(er|e|ème) trimestre)\b/i,
  /\b(taux|ratio|indice|index)\s+(de|d')/i,
  // Material transactions & named entities
  /\b(acquisition|rachat|fusion|levée de fonds|introduction en bourse|ipo|cession|spin-off)\b/i,
  /\b(a annoncé|a déclaré|a confirmé|a racheté|a démenti|a affirmé|a publié|a signé)\b/i,
  /\b(appartient à|est détenu par|est détenue par|est filiale de|a fusionné avec)\b/i,
  // Legal / regulatory
  /\b(loi|article|décret|réglementation|norme|directive|règlement)\s+(n°|num|européen|du|de)/i,
  // Leadership: only when paired with a named role title or a concrete action
  /\b(PDG|CEO|DG|président|présidente|directeur général|directrice générale|fondateur|fondatrice|COO|CFO|CTO)\b/i,
  /\b(a fondé|a créé|a lancé|a quitté|a rejoint|a été nommé|a été nommée|a démissionné)\b/i,
];

const MIN_TEXT_LENGTH = 15;

/**
 * Pre-filter: quickly check if text likely contains a verifiable claim.
 */
export function preFilterClaim(text: string): boolean {
  if (text.length < MIN_TEXT_LENGTH) return false;
  return CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Use Claude Haiku to extract verifiable claims from text.
 */
async function extractClaimsWithLLM(
  segments: TranscriptionSegment[]
): Promise<DetectedClaim[]> {
  const text = segments.map((s) => {
    const prefix = s.speaker ? `[${s.speaker}] ` : "";
    return `${prefix}${s.content}`;
  }).join("\n");

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Analyse ce transcript de réunion de conseil d'administration et extrais les affirmations factuelles vérifiables.

Transcript:
"""
${text}
"""

Retourne UNIQUEMENT un JSON valide (pas de markdown):
{
  "claims": [
    {
      "claim": "L'affirmation reformulée de manière claire et vérifiable",
      "confidence": 0.0-1.0,
      "source_text": "Le texte exact du transcript contenant cette affirmation",
      "speaker": "speaker_id ou null"
    }
  ]
}

Règles:
- Ne retourne QUE des affirmations factuelles vérifiables (chiffres, dates, faits, comparaisons)
- Ignore les opinions, questions, et déclarations subjectives
- confidence = probabilité que ce soit un fait vérifiable
- Si aucune affirmation vérifiable, retourne {"claims": []}`,
        },
      ],
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = parseLlmJson(content);
    return (parsed.claims ?? []).map((c: {
      claim: string;
      confidence: number;
      source_text: string;
      speaker: string | null;
    }) => ({
      claim: c.claim,
      confidence: typeof c.confidence === "number" ? c.confidence : 0.7,
      source_text: c.source_text ?? "",
      speaker: c.speaker ?? null,
    }));
  } catch (error) {
    liveLogger.error("Claim extraction LLM failed", { error: String(error) });
    return [];
  }
}

/**
 * Detect verifiable claims in transcription segments.
 * Uses pre-filter + Claude Haiku for high accuracy.
 */
export async function detectClaims(
  segments: TranscriptionSegment[]
): Promise<DetectedClaim[]> {
  if (segments.length === 0) return [];

  const startTime = Date.now();

  // Pre-filter: only send to LLM if text likely contains claims
  const fullText = segments.map((s) => s.content).join(" ");
  if (!preFilterClaim(fullText)) {
    liveLogger.debug("No claim patterns detected, skipping LLM", {
      text_length: fullText.length,
    });
    return [];
  }

  const claims = await extractClaimsWithLLM(segments);

  liveLogger.info("Claims detected", {
    input_segments: segments.length,
    claims_found: claims.length,
    latency_ms: Date.now() - startTime,
  });

  return claims;
}
