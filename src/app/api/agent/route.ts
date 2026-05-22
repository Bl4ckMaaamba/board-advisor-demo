import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { runAgentStreaming } from "@/lib/agent";
import {
  createConversation,
  addMessage,
  getMessages,
  updateTitle,
  generateTitle,
} from "@/lib/agent/conversation";
import { AgentStreamEvent } from "@/lib/agent/types";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const {
      query,
      conversation_id,
      board_context,
      document_ids,
      image_base64,
      image_media_type,
    }: {
      query: string;
      conversation_id?: string;
      board_context?: BoardContext;
      document_ids?: string[];
      image_base64?: string;
      image_media_type?: string;
    } = body;

    if (!query?.trim() && !image_base64) {
      return NextResponse.json({ error: "Query requise" }, { status: 400 });
    }
    const effectiveQuery = query?.trim() || "Analyse cette image.";

    if (query && query.length > 5000) {
      return NextResponse.json({ error: "Query trop longue (max 5000 caractères)" }, { status: 400 });
    }

    if (document_ids && (!Array.isArray(document_ids) || document_ids.length > 20)) {
      return NextResponse.json({ error: "document_ids invalide (max 20)" }, { status: 400 });
    }

    // 1. Resolve or create conversation
    let convId = conversation_id;
    let isNew = false;
    if (!convId) {
      convId = await createConversation(supabase, user.id, board_context?.board_id);
      isNew = true;
    } else {
      // Verify conversation ownership
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("user_id")
        .eq("id", convId)
        .single();

      if (convError || !conv) {
        return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
      }
      if (conv.user_id !== user.id) {
        return NextResponse.json({ error: "Accès non autorisé à cette conversation" }, { status: 403 });
      }
    }

    // 2. Save user message
    await addMessage(supabase, convId, "user", effectiveQuery);

    // 3. Resolve document names if specific docs selected
    let documentNames: string[] | undefined;
    if (document_ids && document_ids.length > 0) {
      const { data: docs } = await supabase
        .from("documents")
        .select("name")
        .in("id", document_ids);
      if (docs && docs.length > 0) {
        documentNames = docs.map((d: { name: string }) => d.name);
      }
    }

    // 4. Load enriched board context if board is specified
    let enrichedBoardContext: {
      company_siren?: string | null;
      company_revenue?: string | null;
      company_employees?: string | null;
      company_headquarters?: string | null;
      company_listed?: boolean;
      company_strategic_context?: string | null;
      competitors?: { name: string; description?: string }[];
      key_clients?: { name: string; revenue_share?: string }[];
      tracked_kpis?: string[] | null;
    } | undefined;

    if (board_context?.board_id) {
      const { data: boardData } = await supabase
        .from("boards")
        .select("company_siren, company_revenue, company_employees, company_headquarters, company_listed, company_strategic_context, competitors, key_clients, tracked_kpis")
        .eq("id", board_context.board_id)
        .single();

      if (boardData) {
        enrichedBoardContext = {
          company_siren: boardData.company_siren,
          company_revenue: boardData.company_revenue,
          company_employees: boardData.company_employees,
          company_headquarters: boardData.company_headquarters,
          company_listed: boardData.company_listed,
          company_strategic_context: boardData.company_strategic_context,
          competitors: boardData.competitors,
          key_clients: boardData.key_clients,
          tracked_kpis: boardData.tracked_kpis,
        };
      }
    }

    // 5. Load conversation history
    const history = await getMessages(supabase, convId, 40);
    const messages: Anthropic.MessageParam[] = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // If image attached, replace last user message with vision content block
    if (image_base64 && image_media_type) {
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "user") {
        messages[lastIdx] = {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image_media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: image_base64,
              },
            },
            { type: "text", text: effectiveQuery },
          ],
        };
      }
    }

    // 6. Stream agent response
    const encoder = new TextEncoder();
    let fullAnswer = "";
    let finalSources: AgentStreamEvent | null = null;
    let finalDone: AgentStreamEvent | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Send conversation metadata immediately
        send({
          type: "init",
          conversation_id: convId!,
          is_new_conversation: isNew,
        });

        try {
          const enriched = enrichedBoardContext && board_context ? { base: board_context, ...enrichedBoardContext } : undefined;
          for await (const event of runAgentStreaming(messages, board_context, document_ids, documentNames, user.id, enriched, !!image_base64)) {
            send(event);

            if (event.type === "text") {
              fullAnswer += event.content;
            }
            if (event.type === "sources") {
              finalSources = event;
            }
            if (event.type === "done") {
              finalDone = event;
            }
          }
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }

        // Save assistant response to DB (non-blocking for stream)
        const sourcesData = finalSources?.type === "sources" ? finalSources.sources : [];
        const toolsData = finalDone?.type === "done" ? finalDone.tools_used : [];
        addMessage(supabase, convId!, "assistant", fullAnswer, sourcesData, toolsData).catch((err) =>
          console.error("[Agent] Failed to save message:", err)
        );

        // Auto-title
        if (isNew) {
          generateTitle(query)
            .then((t) => updateTitle(supabase, convId!, t))
            .catch((err) => console.error("[Agent] Title generation failed:", err));
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
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[Agent] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
