import { QueryPlan, ProviderPlan } from "../schemas/query-plan";
import { providerRegistry } from "../layer3-providers/registry";
import { EnrichedQuery } from "./context-injector";

interface PlannerOptions {
  mode: "chatbot" | "fact_check" | "briefing";
  costBudget?: number;
}

const LATENCY_BUDGETS: Record<string, number> = {
  chatbot: 4000,
  fact_check: 8000,
  briefing: 30000,
};

export function buildQueryPlan(
  enriched: EnrichedQuery,
  options: PlannerOptions
): QueryPlan {
  const queryId = crypto.randomUUID();
  const intent = enriched.classification.intent;
  const latencyBudget = LATENCY_BUDGETS[options.mode] ?? 4000;

  // Get providers for this intent
  const intentProviders = providerRegistry.getProvidersForIntent(intent);

  const providerPlans: ProviderPlan[] = intentProviders.map((provider, index) => ({
    provider_id: provider.id,
    priority: index < 2 ? 0 : 1, // First 2 are required, rest are enrichment
    fallback_id: provider.fallbackId,
    timeout_ms: Math.min(provider.defaultTimeoutMs, latencyBudget),
  }));

  return {
    query_id: queryId,
    original_query: enriched.originalQuery,
    classification: enriched.classification,
    providers: providerPlans,
    execution_mode: "parallel",
    latency_budget_ms: latencyBudget,
    cost_budget_eur: options.costBudget ?? 0.05,
  };
}
