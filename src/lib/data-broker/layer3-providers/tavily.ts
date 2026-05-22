import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

export class TavilyProvider implements ProviderAdapter {
  id = "tavily";
  name = "Tavily";
  categories: DataCategory[] = ["press", "finance", "esg"];
  baseConfidence = 0.65;
  defaultTimeoutMs = 5000;
  fallbackId = "brave_search";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const apiKey = getEnvVar("TAVILY_API_KEY");
    const start = Date.now();

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: params.query,
        search_depth: params.intent === "fact_check" ? "advanced" : "basic",
        include_answer: true,
        max_results: Math.min(params.limit, 10),
      }),
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      throw new ProviderError(this.id, `HTTP ${response.status}`, response.status);
    }

    return {
      raw: await response.json(),
      status: response.status,
      latency_ms: latency,
      cost_eur: 0, // Free tier
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query({
        query: "test",
        entities: [],
        intent: "news",
        sector: null,
        geo: null,
        limit: 1,
      });
      return result.status === 200;
    } catch {
      return false;
    }
  }
}
