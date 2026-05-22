import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { AGENT_TOOLS } from "@/lib/agent/tools/definitions";
import { TOOL_EXECUTORS } from "@/lib/agent/tools/registry";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { buildThinkingSystemPrompt } from "@/lib/agent/thinking-prompt";
import { createConversation, addMessage, getMessages, updateTitle, generateTitle } from "@/lib/agent/conversation";
import { AgentStreamEvent, SourceRef } from "@/lib/agent/types";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";

const MODEL_SONNET = "claude-sonnet-4-6";
const MODEL_OPUS = "claude-opus-4-6";
const THINKING_BUDGET = 16000;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function extractSources(result: string, toolName: string, sources: SourceRef[]) {
  const pat = /\[Source\s*:\s*([^\]]+)\]/gi;
  let m;
  while ((m = pat.exec(result)) !== null) {
    const name = m[1].trim();
    const isInternal = toolName === "search_internal_documents";
    if (!sources.some((s) => s.name === name)) {
      sources.push({ name, type: isInternal ? "internal" : "external", provider: toolName });
    }
  }
}

async function executeTools(
  toolUseBlocks: Anthropic.ToolUseBlock[],
  boardContext: BoardContext | undefined,
  toolsUsed: string[],
  sources: SourceRef[],
  documentIds?: string[],
  userId?: string
): Promise<Anthropic.ToolResultBlockParam[]> {
  return Promise.all(
    toolUseBlocks.map(async (toolUse) => {
      toolsUsed.push(toolUse.name);
      const executor = TOOL_EXECUTORS[toolUse.name];
      if (!executor) return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Outil "${toolUse.name}" non trouvé.`, is_error: true };
      try {
        const result = await executor(toolUse.input as Record<string, unknown>, boardContext, documentIds, userId);
        extractSources(result, toolUse.name, sources);
        return { type: "tool_result" as const, tool_use_id: toolUse.id, content: result };
      } catch (err) {
        return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Erreur: ${err instanceof Error ? err.message : err}`, is_error: true };
      }
    })
  );
}

/** Calls Perplexity (non-streamed) and returns the full text + citations */
async function callPerplexity(query: string, boardContext?: BoardContext): Promise<{ text: string; sources: SourceRef[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { text: "", sources: [] };

  const systemMsg = `Tu es un expert en recherche pour conseils d'administration.${boardContext ? ` Contexte : board "${boardContext.name}"${boardContext.sector ? `, secteur ${boardContext.sector}` : ""}.` : ""}
Fournis une synthèse sourcée et factuelle. Sois concis (500 mots max) pour servir de contexte à une analyse plus approfondie.`;

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://boardadvisor.app",
        "X-Title": "Board Advisor",
      },
      body: JSON.stringify({
        model: "perplexity/sonar-deep-research",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: query },
        ],
        stream: false,
      }),
    });

    if (!res.ok) return { text: "", sources: [] };
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    const citations: string[] = data.citations ?? [];
    const sources: SourceRef[] = citations.map((url) => ({
      name: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })(),
      type: "external" as const,
      provider: "perplexity",
      url,
    }));
    return { text, sources };
  } catch {
    return { text: "", sources: [] };
  }
}

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { query, conversation_id, board_context, document_ids, modes }: {
      query: string;
      conversation_id?: string;
      board_context?: BoardContext;
      document_ids?: string[];
      modes: { search: boolean; think: boolean };
    } = body;

    if (!query?.trim()) return NextResponse.json({ error: "Query requise" }, { status: 400 });

    const useThink = !!modes?.think;
    const useSearch = !!modes?.search;

    let convId = conversation_id;
    let isNew = false;
    if (!convId) {
      convId = await createConversation(supabase, user.id, board_context?.board_id);
      isNew = true;
    }
    await addMessage(supabase, convId, "user", query);

    let documentNames: string[] | undefined;
    if (document_ids?.length) {
      const { data: docs } = await supabase.from("documents").select("name").in("id", document_ids);
      if (docs?.length) documentNames = docs.map((d: { name: string }) => d.name);
    }

    const history = await getMessages(supabase, convId, 20);
    const currentMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const startTime = Date.now();
    const systemPrompt = useThink
      ? buildThinkingSystemPrompt(board_context, documentNames)
      : buildSystemPrompt(board_context, documentNames);
    const toolsUsed: string[] = [];
    const sources: SourceRef[] = [];

    const encoder = new TextEncoder();
    let fullAnswer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        send({ type: "init", conversation_id: convId!, is_new_conversation: isNew });
        if (useThink) send({ type: "thinking_start" } as AgentStreamEvent);

        try {
          // ── Phase 1: tool planning + optional Perplexity (in parallel) ──
          const [phase1, perplexityResult] = await Promise.all([
            useThink
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (getClient().messages.create as any)({
                  model: MODEL_OPUS,
                  max_tokens: 1024 + THINKING_BUDGET,
                  thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
                  system: systemPrompt,
                  tools: AGENT_TOOLS,
                  messages: currentMessages,
                }) as Promise<Anthropic.Message>
              : getClient().messages.create({
                  model: MODEL_SONNET,
                  max_tokens: 1024,
                  system: systemPrompt,
                  tools: AGENT_TOOLS,
                  messages: currentMessages,
                }),
            useSearch ? callPerplexity(query, board_context) : Promise.resolve(null),
          ]);

          // ── Execute databroker tools ──
          if (phase1.stop_reason === "tool_use") {
            const toolBlocks = phase1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            send({ type: "tools", names: toolBlocks.map((b) => b.name) });
            const toolResults = await executeTools(toolBlocks, board_context, toolsUsed, sources, document_ids, user.id);
            currentMessages.push({ role: "assistant", content: phase1.content });
            currentMessages.push({ role: "user", content: toolResults });
          }

          // ── Inject Perplexity results as additional context ──
          if (perplexityResult?.text) {
            perplexityResult.sources.forEach((s) => {
              if (!sources.some((x) => x.url === s.url)) sources.push(s);
            });
            send({ type: "tools", names: ["deep_research"] });
            toolsUsed.push("deep_research");
            // Inject as a synthetic user message
            currentMessages.push({
              role: "user",
              content: `[Recherche web Perplexity Deep Research]\n\n${perplexityResult.text}\n\n[Fin des résultats web]`,
            });
          }

          if (useThink) send({ type: "thinking_end" } as AgentStreamEvent);

          // ── Phase 2: streaming synthesis ──
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const streamParams: any = {
            model: useThink ? MODEL_OPUS : MODEL_SONNET,
            max_tokens: useThink ? 8192 + THINKING_BUDGET : 4096,
            system: systemPrompt,
            messages: currentMessages,
            stream: true,
          };
          if (useThink) {
            streamParams.thinking = { type: "enabled", budget_tokens: THINKING_BUDGET };
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const messageStream = (getClient().messages.stream as any)(streamParams);
          for await (const event of messageStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullAnswer += event.delta.text;
              send({ type: "text", content: event.delta.text });
            }
          }

          if (sources.length > 0) send({ type: "sources", sources });
          send({ type: "done", iterations: 2, latency_ms: Date.now() - startTime, tools_used: Array.from(new Set(toolsUsed)) });

          addMessage(supabase, convId!, "assistant", fullAnswer, sources, toolsUsed).catch(console.error);
          if (isNew) generateTitle(query).then((t) => updateTitle(supabase, convId!, t)).catch(console.error);
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "Erreur inconnue" });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
