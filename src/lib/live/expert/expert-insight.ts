import Anthropic from "@anthropic-ai/sdk";
import { ExpertProfile } from "./expert-registry";
import { EXPERT_SYSTEM_PROMPTS, buildInsightContext } from "./expert-prompts";

const MODEL_SONNET = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface ExpertInsight {
  expert_id: string;
  expert_name: string;
  take: string;
  analysis: string;
  tags: string[];
  relevance_context?: string;
}

/**
 * Stage 2 — Sonnet call to generate the expert's insight.
 * Returns null if the model decides to skip ("skip": true).
 */
export async function generateExpertInsight(params: {
  expert: ExpertProfile;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  runningSummary: string;
  recentTranscript: string;
  documentContext: string;
  previousInsights: string;
  relevanceContext?: string;
  userQuestion?: string;
}): Promise<ExpertInsight | null> {
  const systemPrompt = EXPERT_SYSTEM_PROMPTS[params.expert.id];
  if (!systemPrompt) return null;

  const fullPrompt = buildInsightContext({
    systemPrompt,
    boardName: params.boardName,
    boardSector: params.boardSector,
    boardStrategicContext: params.boardStrategicContext,
    runningSummary: params.runningSummary,
    recentTranscript: params.recentTranscript,
    documentContext: params.documentContext,
    previousInsights: params.previousInsights,
    userQuestion: params.userQuestion,
  });

  try {
    const response = await getClient().messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: fullPrompt,
      messages: [
        {
          role: "user",
          content: "Analyse la transcription récente et génère ton intervention.",
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Model opted out
    if (parsed.skip === true) return null;

    return {
      expert_id: params.expert.id,
      expert_name: params.expert.name,
      take: parsed.take ?? "",
      analysis: parsed.analysis ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      relevance_context: params.relevanceContext,
    };
  } catch {
    return null;
  }
}
