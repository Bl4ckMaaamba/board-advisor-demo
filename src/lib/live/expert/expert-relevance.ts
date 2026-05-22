import Anthropic from "@anthropic-ai/sdk";
import { ExpertProfile } from "./expert-registry";
import { RELEVANCE_DETECTION_PROMPT } from "./expert-prompts";

const MODEL_HAIKU = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

interface RelevanceResult {
  score: number;
  reason: string;
  should_intervene: boolean;
}

const RELEVANCE_SCORE_THRESHOLD = 8;

/**
 * Stage 1 — Fast Haiku call to determine if the expert should intervene.
 * Returns should_intervene = true only when score >= RELEVANCE_SCORE_THRESHOLD.
 */
export async function checkRelevance(
  expert: ExpertProfile,
  recentTranscript: string,
  previousTakes: string
): Promise<RelevanceResult> {
  const prompt = RELEVANCE_DETECTION_PROMPT
    .replace("{expert_name}", expert.name)
    .replace("{expert_id}", expert.id)
    .replace("{expert_cognitive_framework}", expert.cognitiveFramework)
    .replace("{last_30_seconds_transcript}", recentTranscript)
    .replace("{list_of_previous_takes}", previousTakes);

  try {
    const response = await getClient().messages.create({
      model: MODEL_HAIKU,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON (may be wrapped in ```json...```)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 0, reason: "parse error", should_intervene: false };

    const parsed = JSON.parse(jsonMatch[0]) as RelevanceResult;
    return {
      score: parsed.score ?? 0,
      reason: parsed.reason ?? "",
      should_intervene: (parsed.score ?? 0) >= RELEVANCE_SCORE_THRESHOLD,
    };
  } catch {
    return { score: 0, reason: "error", should_intervene: false };
  }
}
