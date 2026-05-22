import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

export class BraveSearchProvider implements ProviderAdapter {
  id = "brave_search";
  name = "Brave Search";
  categories: DataCategory[] = ["press", "finance", "esg"];
  baseConfidence = 0.6;
  defaultTimeoutMs = 5000;
  fallbackId = "tavily";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const apiKey = getEnvVar("BRAVE_API_KEY");
    const start = Date.now();

    const searchParams = new URLSearchParams({
      q: params.query,
      count: String(Math.min(params.limit, 20)),
      search_lang: "fr",
    });

    // Use freshness based on intent
    if (params.intent === "fact_check") {
      searchParams.set("freshness", "pd"); // past day
    } else if (params.intent === "news") {
      searchParams.set("freshness", "pw"); // past week
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${searchParams}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    const latency = Date.now() - start;

    if (!response.ok) {
      throw new ProviderError(
        this.id,
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();

    return {
      raw: data,
      status: response.status,
      latency_ms: latency,
      cost_eur: 0, // Free tier (2000/month)
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
