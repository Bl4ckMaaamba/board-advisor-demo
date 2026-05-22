import { DataPacket, ArticleContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface BraveWebResult {
  title: string;
  description: string;
  url: string;
  page_age?: string;
  meta_url?: { hostname: string };
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
  query?: { original: string };
}

export class BraveNormalizer implements ResponseNormalizer<BraveSearchResponse> {
  normalize(raw: BraveSearchResponse, queryId: string): DataPacket[] {
    const results = raw.web?.results ?? [];
    const now = new Date().toISOString();

    return results.map((result): DataPacket => {
      const content: ArticleContent = {
        title: result.title,
        summary: result.description,
        source_name: result.meta_url?.hostname ?? new URL(result.url).hostname,
        published_at: result.page_age ?? null,
        url: result.url,
        relevance_score: 0.6,
      };

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "brave_search",
        category: "press",
        data_type: "article",
        content,
        confidence: 0.6,
        freshness: result.page_age ?? now,
        retrieved_at: now,
        ttl: getTtlForCategory("press", "article"),
        source_url: result.url,
        cost_eur: 0,
        latency_ms: 0, // set by execution engine
        conflicts: null,
      };
    });
  }
}
