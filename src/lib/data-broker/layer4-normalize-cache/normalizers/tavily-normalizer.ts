import { DataPacket, ArticleContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

export class TavilyNormalizer implements ResponseNormalizer<TavilyResponse> {
  normalize(raw: TavilyResponse, queryId: string): DataPacket[] {
    const results = raw.results ?? [];
    const now = new Date().toISOString();

    return results.map((result): DataPacket => {
      const content: ArticleContent = {
        title: result.title,
        summary: result.content?.substring(0, 500) ?? "",
        source_name: new URL(result.url).hostname,
        published_at: result.published_date ?? null,
        url: result.url,
        relevance_score: result.score ?? 0.65,
      };

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "tavily",
        category: "press",
        data_type: "article",
        content,
        confidence: 0.65,
        freshness: result.published_date ?? now,
        retrieved_at: now,
        ttl: getTtlForCategory("press", "article"),
        source_url: result.url,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      };
    });
  }
}
