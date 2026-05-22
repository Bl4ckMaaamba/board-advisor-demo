import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { AGENT_TOOLS, } from "@/lib/agent/tools/definitions";
import { TOOL_EXECUTORS } from "@/lib/agent/tools/registry";
import { buildThinkingSystemPrompt } from "@/lib/agent/thinking-prompt";
import {
  createConversation,
  addMessage,
  getMessages,
  updateTitle,
  generateTitle,
} from "@/lib/agent/conversation";
import { AgentStreamEvent, SourceRef } from "@/lib/agent/types";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";

const MODEL = "claude-opus-4-6";
const THINKING_BUDGET = 16000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function extractSources(result: string, toolName: string, sources: SourceRef[]): void {
  const sourcePattern = /\[Source\s*:\s*([^\]]+)\]/gi;
  let match;
  while ((match = sourcePattern.exec(result)) !== null) {
    const name = match[1].trim();
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
      if (!executor) {
        return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Outil "${toolUse.name}" non trouvé.`, is_error: true };
      }
      try {
        const result = await executor(toolUse.input as Record<string, unknown>, boardContext, documentIds, userId);
        extractSources(result, toolUse.name, sources);
        return { type: "tool_result" as const, tool_use_id: toolUse.id, content: result };
      } catch (error) {
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: `Erreur de l'outil ${toolUse.name} : ${error instanceof Error ? error.message : "Erreur inconnue"}`,
          is_error: true,
        };
      }
    })
  );
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
    const { query, conversation_id, board_context, document_ids }: {
      query: string;
      conversation_id?: string;
      board_context?: BoardContext;
      document_ids?: string[];
    } = body;

    if (!query?.trim()) return NextResponse.json({ error: "Query requise" }, { status: 400 });

    // Resolve or create conversation
    let convId = conversation_id;
    let isNew = false;
    if (!convId) {
      convId = await createConversation(supabase, user.id, board_context?.board_id);
      isNew = true;
    }

    await addMessage(supabase, convId, "user", query);

    // Resolve document names
    let documentNames: string[] | undefined;
    if (document_ids && document_ids.length > 0) {
      const { data: docs } = await supabase.from("documents").select("name").in("id", document_ids);
      if (docs?.length) documentNames = docs.map((d: { name: string }) => d.name);
    }

    // Load history
    const history = await getMessages(supabase, convId, 20);
    const messages: Anthropic.MessageParam[] = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const systemPrompt = buildThinkingSystemPrompt(board_context, documentNames);
    const toolsUsed: string[] = [];
    const sources: SourceRef[] = [];
    const currentMessages: Anthropic.MessageParam[] = [...messages];

    const encoder = new TextEncoder();
    let fullAnswer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        send({ type: "init", conversation_id: convId!, is_new_conversation: isNew });
        // Signal thinking mode
        send({ type: "thinking_start" } as AgentStreamEvent);

        try {
          // Phase 1 : outil selection (non-streamé, rapide)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const phase1 = await (getClient().messages.create as any)({
            model: MODEL,
            max_tokens: 1024 + THINKING_BUDGET,
            thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
            system: systemPrompt,
            tools: AGENT_TOOLS,
            messages: currentMessages,
          }) as Anthropic.Message;

          // Si réponse directe sans outils
          if (phase1.stop_reason !== "tool_use") {
            const text = phase1.content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("");
            send({ type: "thinking_end" } as AgentStreamEvent);
            await sendTextChunked(text, send);
            fullAnswer = text;
          } else {
            // Exécuter les outils en parallèle
            const toolUseBlocks = phase1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            send({ type: "tools", names: toolUseBlocks.map((b) => b.name) });

            const toolResults = await executeTools(toolUseBlocks, board_context, toolsUsed, sources, document_ids, user.id);
            currentMessages.push({ role: "assistant", content: phase1.content });
            currentMessages.push({ role: "user", content: toolResults });

            // Phase 2 : synthèse avec extended thinking + streaming
            send({ type: "thinking_end" } as AgentStreamEvent);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messageStream = (getClient().messages.stream as any)({
              model: MODEL,
              max_tokens: 8192 + THINKING_BUDGET,
              thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
              system: systemPrompt,
              messages: currentMessages,
            });

            for await (const event of messageStream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                send({ type: "text", content: event.delta.text });
                fullAnswer += event.delta.text;
              }
            }
          }

          // Sources + done
          if (sources.length > 0) send({ type: "sources", sources });
          send({ type: "done", iterations: 2, latency_ms: 0, tools_used: Array.from(new Set(toolsUsed)) });

          // Sauvegarde
          addMessage(supabase, convId!, "assistant", fullAnswer, sources, toolsUsed).catch(console.error);
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
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

// Helper pour envoyer du texte en chunks (simuler un streaming fluide sur réponse directe)
async function sendTextChunked(text: string, send: (e: AgentStreamEvent) => void): Promise<void> {
  const chunkSize = 3;
  for (let i = 0; i < text.length; i += chunkSize) {
    send({ type: "text", content: text.slice(i, i + chunkSize) });
    await new Promise((r) => setTimeout(r, 5));
  }
}
