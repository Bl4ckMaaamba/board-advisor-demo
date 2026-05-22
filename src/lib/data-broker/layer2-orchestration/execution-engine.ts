import { DataPacket } from "../schemas/data-packet";
import { QueryPlan } from "../schemas/query-plan";
import { ProviderStatus } from "../schemas/query-params";
import { providerRegistry } from "../layer3-providers/registry";
import { circuitBreaker } from "./circuit-breaker";
import { costController } from "./cost-controller";
import { cacheManager, buildCacheKey } from "../layer4-normalize-cache/cache/cache-manager";
import { getNormalizer } from "../layer4-normalize-cache/normalizers/normalizer-registry";
import { mergeResults } from "../layer5-egress/data-merger";
import { brokerLogger } from "../utils/logger";
import { ProviderTimeoutError, CircuitOpenError } from "../utils/errors";

interface ExecutionResult {
  packets: DataPacket[];
  providerStatuses: Record<string, ProviderStatus>;
  totalLatencyMs: number;
}

async function executeProvider(
  providerId: string,
  plan: QueryPlan,
  timeoutMs: number
): Promise<{ packets: DataPacket[]; status: ProviderStatus }> {
  const provider = providerRegistry.getProvider(providerId);
  if (!provider) {
    brokerLogger.warn("Provider not found", { provider: providerId });
    return { packets: [], status: "error" };
  }

  // Check circuit breaker — throw to trigger fallback chain
  if (!circuitBreaker.canExecute(providerId)) {
    brokerLogger.info("Circuit open, skipping", { provider: providerId });
    throw new CircuitOpenError(providerId);
  }

  // Check cache
  const entityNames = plan.classification.entities.map((e) => e.name);
  const cacheKey = buildCacheKey(plan.classification.intent, entityNames, providerId);
  const cached = await cacheManager.get(cacheKey);

  if (cached) {
    brokerLogger.debug("Cache hit", { provider: providerId, level: cached.level });
    return { packets: cached.packets, status: "cache_hit" };
  }

  // Execute with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = {
      query: plan.original_query,
      entities: plan.classification.entities,
      intent: plan.classification.intent,
      sector: null,
      geo: null,
      limit: 10,
    };

    const rawResponse = await provider.query(params);

    clearTimeout(timer);

    // Check cost budget
    costController.checkRequestBudget(rawResponse.cost_eur, plan.cost_budget_eur);
    costController.recordRequestCost(rawResponse.cost_eur);

    // Normalize
    const normalizer = getNormalizer(providerId);
    const packets = normalizer.normalize(rawResponse.raw, plan.query_id);

    // Update latency and cost on packets
    const enrichedPackets = packets.map((p) => ({
      ...p,
      latency_ms: rawResponse.latency_ms,
      cost_eur: rawResponse.cost_eur / Math.max(packets.length, 1),
    }));

    // Cache the results
    if (enrichedPackets.length > 0) {
      const ttl = enrichedPackets[0].ttl;
      await cacheManager.set(cacheKey, enrichedPackets, ttl);
    }

    // Record success
    circuitBreaker.recordSuccess(providerId);

    brokerLogger.info("Provider success", {
      provider: providerId,
      query_id: plan.query_id,
      latency_ms: rawResponse.latency_ms,
      cost_eur: rawResponse.cost_eur,
      results: enrichedPackets.length,
    });

    return { packets: enrichedPackets, status: "success" };
  } catch (error) {
    clearTimeout(timer);
    circuitBreaker.recordFailure(providerId);

    if (controller.signal.aborted) {
      brokerLogger.warn("Provider timeout", { provider: providerId, timeoutMs });
      throw new ProviderTimeoutError(providerId, timeoutMs);
    }

    throw error;
  }
}

async function executeWithFallback(
  providerId: string,
  plan: QueryPlan,
  timeoutMs: number,
  remainingBudgetMs: number
): Promise<{ packets: DataPacket[]; status: ProviderStatus; providerId: string }> {
  try {
    const result = await executeProvider(providerId, plan, timeoutMs);
    return { ...result, providerId };
  } catch (error) {
    // Try fallback
    const provider = providerRegistry.getProvider(providerId);
    const fallbackId = provider?.fallbackId;

    if (fallbackId && remainingBudgetMs > 1000) {
      brokerLogger.info("Trying fallback", {
        from: providerId,
        to: fallbackId,
        remaining_ms: remainingBudgetMs,
      });

      try {
        const fallbackTimeout = Math.min(remainingBudgetMs - 500, timeoutMs);
        const result = await executeProvider(fallbackId, plan, fallbackTimeout);
        return { ...result, status: "fallback", providerId: fallbackId };
      } catch {
        brokerLogger.warn("Fallback also failed", { fallback: fallbackId });
      }
    }

    return {
      packets: [],
      status: error instanceof CircuitOpenError ? "circuit_open" : "error",
      providerId,
    };
  }
}

export async function executeQueryPlan(plan: QueryPlan): Promise<ExecutionResult> {
  const startTime = Date.now();
  costController.resetRequestCost();

  // Check global budget
  await costController.checkGlobalBudget();

  const providerStatuses: Record<string, ProviderStatus> = {};

  // Execute all providers in parallel
  const promises = plan.providers.map((providerPlan) => {
    const elapsed = Date.now() - startTime;
    const remainingBudget = plan.latency_budget_ms - elapsed;

    return executeWithFallback(
      providerPlan.provider_id,
      plan,
      providerPlan.timeout_ms,
      remainingBudget
    );
  });

  const results = await Promise.allSettled(promises);

  // Collect results
  let allPackets: DataPacket[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allPackets = allPackets.concat(result.value.packets);
      providerStatuses[result.value.providerId] = result.value.status;
    } else {
      brokerLogger.error("Provider execution failed", {
        error: String(result.reason),
      });
    }
  }

  // Merge, deduplicate, detect conflicts
  const mergedPackets = mergeResults(allPackets);

  const totalLatency = Date.now() - startTime;

  // Record monthly costs
  const totalCost = mergedPackets.reduce((sum, p) => sum + p.cost_eur, 0);
  if (totalCost > 0) {
    await costController.recordMonthlyCost(totalCost);
  }

  if (totalLatency > plan.latency_budget_ms) {
    brokerLogger.warn("Latency budget exceeded", {
      query_id: plan.query_id,
      budget_ms: plan.latency_budget_ms,
      actual_ms: totalLatency,
    });
  }

  return {
    packets: mergedPackets,
    providerStatuses,
    totalLatencyMs: totalLatency,
  };
}
