/**
 * Génère un résumé progressif de la réunion via Haiku.
 * Appelé toutes les 15 min par l'orchestrateur.
 * Fire-and-forget avec timeout 30s — ne bloque jamais le pipeline live.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const TIMEOUT_MS = 30_000;

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * @param recentTranscript - Les 30 derniers segments formatés "speaker: content"
 * @param previousSummary - Le résumé précédent (vide au premier appel)
 * @returns Le nouveau résumé (3-5 phrases), ou null si échec
 */
export async function generateRunningSummary(
  recentTranscript: string,
  previousSummary: string
): Promise<string | null> {
  if (!recentTranscript.trim()) return null;

  const previousSection = previousSummary
    ? `\nRÉSUMÉ PRÉCÉDENT (à enrichir, pas à répéter) :\n${previousSummary}\n`
    : "";

  const prompt = `${previousSection}
TRANSCRIPTION RÉCENTE :
${recentTranscript}

Résume en 3 à 5 phrases factuelles et neutres ce qui a été discuté dans cette réunion de conseil d'administration : sujets abordés, décisions évoquées, positions exprimées, points de désaccord s'il y en a. Sois synthétique.${previousSummary ? " Intègre les éléments du résumé précédent sans les répéter mot pour mot." : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal }
    );

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
