import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getOptionalEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

export class NewsApiProvider implements ProviderAdapter {
  id = "newsapi";
  name = "NewsAPI";
  categories: DataCategory[] = ["press"];
  baseConfidence = 0.7;
  defaultTimeoutMs = 5000;
  fallbackId = "google_news_rss";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const apiKey = getOptionalEnvVar("NEWSAPI_API_KEY");

    // If no API key, return empty (graceful degradation)
    if (!apiKey) {
      return { raw: { articles: [] }, status: 200, latency_ms: 0, cost_eur: 0 };
    }

    const start = Date.now();

    const searchParams = new URLSearchParams({
      q: params.query,
      language: "fr",
      sortBy: "publishedAt",
      pageSize: String(Math.min(params.limit, 20)),
      apiKey,
    });

    const response = await fetch(
      `https://newsapi.org/v2/everything?${searchParams}`
    );
    const latency = Date.now() - start;

    if (!response.ok) {
      throw new ProviderError(this.id, `HTTP ${response.status}`, response.status);
    }

    return {
      raw: await response.json(),
      status: response.status,
      latency_ms: latency,
      cost_eur: 0, // Free dev tier
    };
  }

  async healthCheck(): Promise<boolean> {
    const apiKey = getOptionalEnvVar("NEWSAPI_API_KEY");
    return apiKey !== undefined;
  }
}
