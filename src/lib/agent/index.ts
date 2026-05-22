import Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS } from "./tools/definitions";
import { TOOL_EXECUTORS } from "./tools/registry";
import { buildSystemPrompt, EnrichedBoardContext } from "./system-prompt";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { AgentResult, AgentStreamEvent, SourceRef } from "./types";

const MAX_FOLLOW_UPS = 1;
const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractSourcesFromToolResult(
  result: string,
  toolName: string,
  sources: SourceRef[]
): void {
  const sourcePattern = /\[Source\s*:\s*([^\]]+)\]/gi;
  let match;
  while ((match = sourcePattern.exec(result)) !== null) {
    const name = match[1].trim();
    const isInternal = toolName === "search_internal_documents";
    if (!sources.some((s) => s.name === name && s.type === (isInternal ? "internal" : "external"))) {
      sources.push({
        name,
        type: isInternal ? "internal" : "external",
        provider: toolName,
      });
    }
  }

  const providerPattern = /\[([A-Z_]+)\]\s*\((\d+)%\)/gi;
  while ((match = providerPattern.exec(result)) !== null) {
    const provider = match[1].toLowerCase();
    const confidence = parseInt(match[2]) / 100;
    if (!sources.some((s) => s.provider === provider)) {
      sources.push({
        name: provider,
        type: "external",
        provider,
        confidence,
      });
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
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: `Outil "${toolUse.name}" non trouvé.`,
          is_error: true,
        };
      }

      try {
        const result = await executor(
          toolUse.input as Record<string, unknown>,
          boardContext,
          documentIds,
          userId
        );
        extractSourcesFromToolResult(result, toolUse.name, sources);
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result,
        };
      } catch (error) {
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: `Erreur de l'outil ${toolUse.name} : ${error instanceof Error ? error.message : "Erreur inconnue"}. Continue avec les informations disponibles.`,
          is_error: true,
        };
      }
    })
  );
}

export async function runAgent(
  messages: Anthropic.MessageParam[],
  boardContext?: BoardContext,
  documentIds?: string[],
  documentNames?: string[],
  userId?: string,
  enrichedContext?: EnrichedBoardContext
): Promise<AgentResult> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(boardContext, documentNames, enrichedContext);
  const toolsUsed: string[] = [];
  const sources: SourceRef[] = [];
  const currentMessages: Anthropic.MessageParam[] = [...messages];

  // ── Phase 1: Initial tool selection (Sonnet picks ALL tools at once) ──
  const t1 = Date.now();
  const phase1 = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: AGENT_TOOLS,
    messages: currentMessages,
  });

  // If Claude answered directly without tools
  if (phase1.stop_reason !== "tool_use") {
    const textBlock = phase1.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    return {
      answer: textBlock?.text ?? "Pas de réponse générée.",
      toolsUsed: [],
      sources: [],
      iterations: 1,
      totalLatencyMs: Date.now() - startTime,
    };
  }

  console.log(`[Agent] Phase 1 (planning): ${Date.now() - t1}ms — ${phase1.content.filter(b => b.type === "tool_use").length} tools selected`);

  // Execute all Phase 1 tools in parallel
  const t2 = Date.now();
  const toolUseBlocks = phase1.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  const toolResults = await executeTools(toolUseBlocks, boardContext, toolsUsed, sources, documentIds, userId);

  console.log(`[Agent] Phase 1 (tools exec): ${Date.now() - t2}ms — ${toolUseBlocks.map(b => b.name).join(", ")}`);

  currentMessages.push({ role: "assistant", content: phase1.content });
  currentMessages.push({ role: "user", content: toolResults });

  // ── Phase 2: Synthesis (with up to MAX_FOLLOW_UPS additional tool calls) ──
  let followUps = 0;

  while (followUps <= MAX_FOLLOW_UPS) {
    const tSynth = Date.now();
    const isLastRound = followUps >= MAX_FOLLOW_UPS;
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 32000,
      system: systemPrompt,
      tools: !isLastRound ? AGENT_TOOLS : undefined,
      messages: currentMessages,
      ...(isLastRound ? { thinking: { type: "enabled" as const, budget_tokens: 10000 } } : {}),
    });

    if (response.stop_reason === "tool_use" && !isLastRound) {
      // Follow-up: Claude needs more data based on initial results
      console.log(`[Agent] Follow-up ${followUps + 1} (Sonnet): ${Date.now() - tSynth}ms`);
      followUps++;
      const moreToolBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      const moreResults = await executeTools(moreToolBlocks, boardContext, toolsUsed, sources, documentIds, userId);

      console.log(`[Agent] Follow-up ${followUps} (tools exec): ${Date.now() - tSynth}ms — ${moreToolBlocks.map(b => b.name).join(", ")}`);

      currentMessages.push({ role: "assistant", content: response.content });
      currentMessages.push({ role: "user", content: moreResults });
    } else {
      // Final answer
      console.log(`[Agent] Synthesis: ${Date.now() - tSynth}ms — ${response.content.find(b => b.type === "text") ? `${(response.content.find(b => b.type === "text") as Anthropic.TextBlock).text.length} chars` : "no text"}`);
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return {
        answer: textBlock?.text ?? "Pas de réponse générée.",
        toolsUsed: Array.from(new Set(toolsUsed)),
        sources,
        iterations: 1 + followUps + 1, // phase1 + follow-ups + synthesis
        totalLatencyMs: Date.now() - startTime,
      };
    }
  }

  // Safety fallback (should not reach here)
  const finalResponse = await getClient().messages.create({
    model: MODEL,
    max_tokens: 32000,
    system: systemPrompt,
    messages: [
      ...currentMessages,
      {
        role: "user",
        content: "Fournis ta meilleure réponse avec les informations collectées.",
      },
    ],
  });

  const textBlock = finalResponse.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  return {
    answer: textBlock?.text ?? "Analyse incomplète.",
    toolsUsed: Array.from(new Set(toolsUsed)),
    sources,
    iterations: 1 + MAX_FOLLOW_UPS + 1,
    totalLatencyMs: Date.now() - startTime,
  };
}

/**
 * Streaming version of runAgent.
 * Yields AgentStreamEvents: tools → text tokens → sources → done
 */
export async function* runAgentStreaming(
  messages: Anthropic.MessageParam[],
  boardContext?: BoardContext,
  documentIds?: string[],
  documentNames?: string[],
  userId?: string,
  enrichedContext?: EnrichedBoardContext,
  hasImage?: boolean
): AsyncGenerator<AgentStreamEvent> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(boardContext, documentNames, enrichedContext);
  const toolsUsed: string[] = [];
  const sources: SourceRef[] = [];
  const currentMessages: Anthropic.MessageParam[] = [...messages];

  // ── Phase 1: Planning (non-streamed, fast) ──
  // If image is present, skip tool planning — Claude Vision answers directly
  const phase1 = await getClient().messages.create({
    model: MODEL,
    max_tokens: hasImage ? 4096 : 2048,
    system: systemPrompt,
    ...(hasImage ? {} : { tools: AGENT_TOOLS }),
    messages: currentMessages,
  });

  // Direct answer without tools
  if (phase1.stop_reason !== "tool_use") {
    const text = phase1.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )?.text ?? "Pas de réponse générée.";
    yield { type: "text", content: text };
    yield { type: "done", iterations: 1, latency_ms: Date.now() - startTime, tools_used: [] };
    return;
  }

  // Emit tool names for frontend activity indicator
  const toolUseBlocks = phase1.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  yield { type: "tools", names: toolUseBlocks.map((b) => b.name) };

  // Execute tools in parallel
  const toolResults = await executeTools(toolUseBlocks, boardContext, toolsUsed, sources, documentIds, userId);

  currentMessages.push({ role: "assistant", content: phase1.content });
  currentMessages.push({ role: "user", content: toolResults });

  // ── Phase 2: Streaming synthesis (with optional tool follow-up) ──
  let followUps = 0;

  while (followUps <= MAX_FOLLOW_UPS) {
    // Determine if this is the last possible round (no more follow-ups allowed)
    const isLastRound = followUps >= MAX_FOLLOW_UPS;
    const streamParams: Anthropic.MessageCreateParamsStreaming = {
      model: MODEL,
      max_tokens: 32000,
      system: systemPrompt,
      messages: currentMessages,
      stream: true as const,
    };
    if (!isLastRound) {
      streamParams.tools = AGENT_TOOLS;
    } else {
      (streamParams as unknown as Record<string, unknown>).thinking = { type: "enabled", budget_tokens: 10000 };
    }
    const messageStream = getClient().messages.stream(streamParams);

    if (isLastRound) {
      // Last round: stream text directly to client in real-time
      for await (const event of messageStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", content: event.delta.text };
        }
      }
      break;
    }

    // Intermediate round: buffer text (might need to discard if follow-up)
    const textChunks: string[] = [];
    for await (const event of messageStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        textChunks.push(event.delta.text);
      }
    }

    const finalMessage = await messageStream.finalMessage();

    if (finalMessage.stop_reason === "tool_use") {
      // Follow-up needed — discard intermediate reasoning text
      followUps++;
      const moreToolBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      yield { type: "tools", names: moreToolBlocks.map((b) => b.name) };

      const moreResults = await executeTools(moreToolBlocks, boardContext, toolsUsed, sources, documentIds, userId);
      currentMessages.push({ role: "assistant", content: finalMessage.content });
      currentMessages.push({ role: "user", content: moreResults });
      continue;
    }

    // No tool_use — stream the buffered text as final answer
    for (const chunk of textChunks) {
      yield { type: "text", content: chunk };
    }
    break;
  }

  // Emit sources and completion
  if (sources.length > 0) {
    yield { type: "sources", sources };
  }

  yield {
    type: "done",
    iterations: 1 + followUps + 1,
    latency_ms: Date.now() - startTime,
    tools_used: Array.from(new Set(toolsUsed)),
  };
}
