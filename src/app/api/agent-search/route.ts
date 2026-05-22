import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import {
  createConversation,
  addMessage,
  getMessages,
  updateTitle,
  generateTitle,
} from "@/lib/agent/conversation";
import { AgentStreamEvent, SourceRef } from "@/lib/agent/types";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "perplexity/sonar-deep-research";

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API Perplexity manquante" }, { status: 500 });
    }

    const body = await req.json();
    const { query, conversation_id, board_context }: {
      query: string;
      conversation_id?: string;
      board_context?: BoardContext;
    } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query requise" }, { status: 400 });
    }

    // Resolve or create conversation
    let convId = conversation_id;
    let isNew = false;
    if (!convId) {
      convId = await createConversation(supabase, user.id, board_context?.board_id);
      isNew = true;
    }
    await addMessage(supabase, convId, "user", query);

    // Load history (last 10 messages for context)
    const history = await getMessages(supabase, convId, 10);
    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Build system prompt tailored for board governance research
    const systemPrompt = buildSearchSystemPrompt(board_context);

    const encoder = new TextEncoder();
    let fullAnswer = "";
    const sources: SourceRef[] = [];
    const startTime = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        send({ type: "init", conversation_id: convId!, is_new_conversation: isNew });
        send({ type: "tools", names: ["deep_research"] });

        try {
          const orRes = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://boardadvisor.app",
              "X-Title": "Board Advisor",
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                ...messages,
              ],
              stream: true,
            }),
          });

          if (!orRes.ok) {
            const errText = await orRes.text();
            throw new Error(`OpenRouter error ${orRes.status}: ${errText}`);
          }

          const reader = orRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let citationsEmitted = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                // Text delta
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullAnswer += delta;
                  send({ type: "text", content: delta });
                }

                // Citations (Perplexity returns these in the stream)
                if (parsed.citations && !citationsEmitted) {
                  citationsEmitted = true;
                  const citationSources: SourceRef[] = (parsed.citations as string[]).map((url) => ({
                    name: extractDomain(url),
                    type: "external" as const,
                    provider: "perplexity",
                    url,
                  }));
                  citationSources.forEach((s) => {
                    if (!sources.some((x) => x.url === s.url)) sources.push(s);
                  });
                }
              } catch {
                // skip malformed JSON chunk
              }
            }
          }

          if (sources.length > 0) {
            send({ type: "sources", sources });
          }

          send({
            type: "done",
            iterations: 1,
            latency_ms: Date.now() - startTime,
            tools_used: ["deep_research"],
          });

          // Save to DB
          addMessage(supabase, convId!, "assistant", fullAnswer, sources, ["deep_research"]).catch(console.error);
          if (isNew) {
            generateTitle(query).then((t) => updateTitle(supabase, convId!, t)).catch(console.error);
          }
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "Erreur inconnue" });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}

function buildSearchSystemPrompt(boardContext?: BoardContext): string {
  const context = boardContext
    ? `Contexte : board "${boardContext.name}"${boardContext.sector ? `, secteur ${boardContext.sector}` : ""}. Rôle de l'utilisateur : ${boardContext.role}.`
    : "";

  return `Tu es un expert en recherche pour administrateurs de conseil d'administration.
${context}

Ton rôle : effectuer une investigation approfondie et produire un rapport structuré, sourcé et actionnable.

Format de réponse OBLIGATOIRE :

## Synthèse exécutive
(3-5 lignes : l'essentiel pour l'administrateur)

## Analyse détaillée
(sections thématiques selon la question)

## Points critiques pour le board
(risques, opportunités, questions à poser en séance)

## Sources consultées
(les sources principales utilisées)

Règles :
- Citer les sources inline avec [1], [2], etc.
- Signaler les contradictions entre sources
- Dater les informations récentes
- Langue : français, ton professionnel`;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
