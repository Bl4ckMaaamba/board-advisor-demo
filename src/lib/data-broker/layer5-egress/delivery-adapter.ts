import { DataPacket } from "../schemas/data-packet";
import { DataBrokerResponse, ProviderStatus } from "../schemas/query-params";

export interface ChatbotDelivery {
  query_id: string;
  packets: DataPacket[];
  total_cost_eur: number;
  total_latency_ms: number;
  provider_statuses: Record<string, ProviderStatus>;
  summary: string;
}

export function formatForChatbot(
  queryId: string,
  packets: DataPacket[],
  providerStatuses: Record<string, ProviderStatus>,
  totalLatencyMs: number
): ChatbotDelivery {
  const totalCost = packets.reduce((sum, p) => sum + p.cost_eur, 0);

  // Build a short summary of sources
  const providers = Array.from(new Set(packets.map((p) => p.provider)));
  const summary = `${packets.length} résultat(s) de ${providers.join(", ")} en ${totalLatencyMs}ms`;

  return {
    query_id: queryId,
    packets,
    total_cost_eur: Math.round(totalCost * 10000) / 10000,
    total_latency_ms: totalLatencyMs,
    provider_statuses: providerStatuses,
    summary,
  };
}

export function formatAsResponse(
  queryId: string,
  packets: DataPacket[],
  providerStatuses: Record<string, ProviderStatus>,
  totalLatencyMs: number
): DataBrokerResponse {
  const totalCost = packets.reduce((sum, p) => sum + p.cost_eur, 0);

  return {
    query_id: queryId,
    packets,
    total_cost_eur: Math.round(totalCost * 10000) / 10000,
    total_latency_ms: totalLatencyMs,
    provider_statuses: providerStatuses,
  };
}
