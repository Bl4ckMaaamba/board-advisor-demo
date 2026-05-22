import { BoardContext } from "@/lib/data-broker/schemas/query-params";

export interface SourceRef {
  name: string;
  type: "internal" | "external";
  provider?: string;
  url?: string;
  confidence?: number;
}

export interface AgentResult {
  answer: string;
  toolsUsed: string[];
  sources: SourceRef[];
  iterations: number;
  totalLatencyMs: number;
}

export interface AgentRequest {
  query: string;
  conversation_id?: string;
  board_context?: BoardContext;
}

export interface AgentResponse {
  conversation_id: string;
  answer: string;
  sources: SourceRef[];
  tools_used: string[];
  iterations: number;
  latency_ms: number;
  is_new_conversation: boolean;
  title?: string;
}

export type ToolExecutor = (
  input: Record<string, unknown>,
  boardContext?: BoardContext,
  documentIds?: string[],
  userId?: string
) => Promise<string>;

// Streaming event types
export type AgentStreamEvent =
  | { type: "init"; conversation_id: string; is_new_conversation: boolean }
  | { type: "tools"; names: string[] }
  | { type: "text"; content: string }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "done"; iterations: number; latency_ms: number; tools_used: string[] }
  | { type: "error"; message: string }
  | { type: "thinking_start" }
  | { type: "thinking_end" };
