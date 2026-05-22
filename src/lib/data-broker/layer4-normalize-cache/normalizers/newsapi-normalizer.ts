import { DataPacket, ArticleContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface NewsApiArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: { name: string };
}

interface NewsApiResponse {
  articles?: NewsApiArticle[];
}

export class NewsApiNormalizer implements ResponseNormalizer<NewsApiResponse> {
  normalize(raw: NewsApiResponse, queryId: string): DataPacket[] {
    const articles = raw.articles ?? [];
    const now = new Date().toISOString();

    return articles.map((article): DataPacket => {
      const content: ArticleContent = {
        title: article.title,
        summary: article.description ?? "",
        source_name: article.source?.name ?? "Unknown",
        published_at: article.publishedAt ?? null,
        url: article.url,
        relevance_score: 0.7,
      };

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "newsapi",
        category: "press",
        data_type: "article",
        content,
        confidence: 0.7,
        freshness: article.publishedAt ?? now,
        retrieved_at: now,
        ttl: getTtlForCategory("press", "article"),
        source_url: article.url,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      };
    });
  }
}
