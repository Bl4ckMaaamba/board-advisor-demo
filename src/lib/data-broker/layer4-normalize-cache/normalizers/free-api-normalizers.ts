import { DataPacket, TimeseriesContent, ArticleContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

// ===== World Bank Normalizer =====

interface WorldBankDataPoint {
  date: string;
  value: number | null;
  indicator: { id: string; value: string };
  country: { value: string };
}

export class WorldBankNormalizer implements ResponseNormalizer<unknown> {
  normalize(raw: unknown, queryId: string): DataPacket[] {
    const now = new Date().toISOString();

    // World Bank returns [metadata, data] array
    if (!Array.isArray(raw) || raw.length < 2) return [];

    const data = raw[1] as WorldBankDataPoint[];
    if (!Array.isArray(data) || data.length === 0) return [];

    const firstPoint = data[0];
    const datapoints = data
      .filter((d) => d.value !== null)
      .map((d) => ({ date: d.date, value: d.value as number }))
      .reverse(); // chronological order

    const content: TimeseriesContent = {
      name: firstPoint.indicator.value,
      unit: "",
      frequency: "annual",
      datapoints,
    };

    return [
      {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "world_bank",
        category: "macro",
        data_type: "timeseries",
        content,
        confidence: 0.9,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("macro", "timeseries"),
        source_url: "https://data.worldbank.org",
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      },
    ];
  }
}

// ===== OpenCorporates Normalizer =====

interface OpenCorporatesCompany {
  company: {
    name: string;
    company_number: string;
    jurisdiction_code: string;
    incorporation_date: string;
    company_type: string;
    registered_address_in_full: string;
    opencorporates_url: string;
  };
}

interface OpenCorporatesResponse {
  results?: {
    companies?: OpenCorporatesCompany[];
  };
}

export class OpenCorporatesNormalizer implements ResponseNormalizer<OpenCorporatesResponse> {
  normalize(raw: OpenCorporatesResponse, queryId: string): DataPacket[] {
    const companies = raw.results?.companies ?? [];
    const now = new Date().toISOString();

    return companies.map((item): DataPacket => {
      const c = item.company;

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "opencorporates",
        category: "finance",
        data_type: "document",
        content: {
          title: c.name,
          summary: `${c.company_type} | ${c.jurisdiction_code} | N°${c.company_number} | Créée: ${c.incorporation_date ?? "N/A"}`,
          source_name: "OpenCorporates",
          document_type: "fiche_entreprise",
          url: c.opencorporates_url,
          full_text: null,
        },
        confidence: 0.6,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("finance", "document"),
        source_url: c.opencorporates_url,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      };
    });
  }
}

// ===== Google News RSS Normalizer =====

interface GoogleNewsRssItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
  description?: string;
}

interface GoogleNewsRssResponse {
  items?: GoogleNewsRssItem[];
}

export class GoogleNewsRssNormalizer implements ResponseNormalizer<GoogleNewsRssResponse> {
  normalize(raw: GoogleNewsRssResponse, queryId: string): DataPacket[] {
    const items = raw.items ?? [];
    const now = new Date().toISOString();

    return items.map((item): DataPacket => {
      const content: ArticleContent = {
        title: item.title ?? "",
        summary: item.description ?? "",
        source_name: item.source ?? "Google News",
        published_at: item.pubDate ?? null,
        url: item.link ?? "",
        relevance_score: 0.5,
      };

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "google_news_rss",
        category: "press",
        data_type: "article",
        content,
        confidence: 0.5,
        freshness: item.pubDate ?? now,
        retrieved_at: now,
        ttl: getTtlForCategory("press", "article"),
        source_url: item.link ?? null,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      };
    });
  }
}
