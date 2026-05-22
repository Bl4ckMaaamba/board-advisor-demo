import { z } from "zod/v4";
import { DataPacketSchema } from "./data-packet";

export const BoardContextSchema = z.object({
  board_id: z.string().uuid(),
  name: z.string(),
  role: z.string(),
  sector: z.string(),
  geo: z.string().optional(),
  company_size: z.string().optional(),
});

export const DataBrokerRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  board_context: BoardContextSchema.optional(),
  mode: z.enum(["chatbot", "fact_check", "briefing"]).default("chatbot"),
});

export const ProviderStatusSchema = z.enum([
  "success",
  "timeout",
  "fallback",
  "circuit_open",
  "error",
  "cache_hit",
]);

export const DataBrokerResponseSchema = z.object({
  query_id: z.string().uuid(),
  packets: z.array(DataPacketSchema),
  total_cost_eur: z.number().min(0),
  total_latency_ms: z.number().int().min(0),
  provider_statuses: z.record(z.string(), ProviderStatusSchema),
});

export type BoardContext = z.infer<typeof BoardContextSchema>;
export type DataBrokerRequest = z.infer<typeof DataBrokerRequestSchema>;
export type DataBrokerResponse = z.infer<typeof DataBrokerResponseSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
