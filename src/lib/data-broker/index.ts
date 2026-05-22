import { classifyQuery } from "./layer1-ingress/classifier";
import { injectContext } from "./layer1-ingress/context-injector";
import { buildQueryPlan } from "./layer1-ingress/query-planner";
import { executeQueryPlan } from "./layer2-orchestration/execution-engine";
import { formatAsResponse } from "./layer5-egress/delivery-adapter";
import { DataBrokerRequest, DataBrokerResponse } from "./schemas/query-params";
import { brokerLogger } from "./utils/logger";

export async function queryDataBroker(
  request: DataBrokerRequest
): Promise<DataBrokerResponse> {
  brokerLogger.info("Data Broker query started", {
    query: request.query.substring(0, 100),
    mode: request.mode,
  });

  // Layer 1 — Ingress
  const classification = await classifyQuery(request.query);

  const enriched = injectContext(
    request.query,
    classification,
    request.board_context
  );

  const plan = buildQueryPlan(enriched, { mode: request.mode });

  brokerLogger.info("Query plan built", {
    query_id: plan.query_id,
    intent: classification.intent,
    providers: plan.providers.map((p) => p.provider_id),
  });

  // Layer 2-4 — Orchestration + Providers + Cache
  const result = await executeQueryPlan(plan);

  // Layer 5 — Egress
  const response = formatAsResponse(
    plan.query_id,
    result.packets,
    result.providerStatuses,
    result.totalLatencyMs
  );

  brokerLogger.info("Data Broker query completed", {
    query_id: plan.query_id,
    total_latency_ms: response.total_latency_ms,
    total_cost_eur: response.total_cost_eur,
    packet_count: response.packets.length,
  });

  return response;
}

export type { DataBrokerRequest, DataBrokerResponse } from "./schemas/query-params";
export type { DataPacket } from "./schemas/data-packet";
