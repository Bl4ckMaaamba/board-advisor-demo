import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/supabase-server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    try {
      await getAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { query, context } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query manquante" }, { status: 400 });
    }

    const systemPrompt = `Tu es Board Advisor, un assistant IA expert en gouvernance d'entreprise, droit des sociétés françaises et conseils d'administration.

Tu aides les administrateurs à préparer leurs réunions, analyser des documents et répondre à leurs questions sur la gouvernance.

Règles :
- Réponds toujours en français, de manière professionnelle et structurée.
- Structure tes réponses avec des titres et des listes quand c'est pertinent.
- Quand tu cites un document, indique clairement la source entre crochets [Source: nom du document].
- Si tu n'es pas sûr d'une information, dis-le explicitement plutôt que d'inventer.
- Sois précis sur les références légales (Code de commerce, Code civil, etc.).

${context ? `Voici des extraits de documents pertinents trouvés dans la base documentaire :\n\n${context}\n\nUtilise ces informations pour répondre à la question. Cite les sources quand c'est pertinent.` : "Aucun document pertinent n'a été trouvé dans la base. Réponds avec tes connaissances générales en gouvernance d'entreprise et droit des sociétés."}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const answer =
      message.content[0].type === "text"
        ? message.content[0].text
        : "Pas de réponse.";

    return NextResponse.json({ answer });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[Chat] Error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
