import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { XMLParser } from "fast-xml-parser";

export class GoogleNewsRssProvider implements ProviderAdapter {
  id = "google_news_rss";
  name = "Google News RSS";
  categories: DataCategory[] = ["press"];
  baseConfidence = 0.5;
  defaultTimeoutMs = 3000;
  fallbackId = null;

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const start = Date.now();

    const response = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(
        params.query
      )}&hl=fr&gl=FR&ceid=FR:fr`
    );

    const text = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(text);

    const items = parsed?.rss?.channel?.item ?? [];
    const results = Array.isArray(items) ? items.slice(0, params.limit) : [items];

    return {
      raw: { items: results },
      status: 200,
      latency_ms: Date.now() - start,
      cost_eur: 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        "https://news.google.com/rss/search?q=test&hl=fr&gl=FR&ceid=FR:fr"
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
