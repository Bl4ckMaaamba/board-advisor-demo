import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

const COMMON_SERIES: Record<string, string> = {
  pib: "GDP",
  gdp: "GDP",
  inflation: "CPIAUCSL",
  "taux directeur": "FEDFUNDS",
  "fed funds": "FEDFUNDS",
  chômage: "UNRATE",
  unemployment: "UNRATE",
  "eur/usd": "DEXUSEU",
  "euro dollar": "DEXUSEU",
};

export class FredProvider implements ProviderAdapter {
  id = "fred";
  name = "FRED (Federal Reserve)";
  categories: DataCategory[] = ["macro"];
  baseConfidence = 0.95;
  defaultTimeoutMs = 5000;
  fallbackId = "world_bank";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const apiKey = getEnvVar("FRED_API_KEY");
    const start = Date.now();

    // Try to match a known series
    const lower = params.query.toLowerCase();
    let seriesId: string | null = null;
    for (const [keyword, id] of Object.entries(COMMON_SERIES)) {
      if (lower.includes(keyword)) {
        seriesId = id;
        break;
      }
    }

    let data: unknown;

    if (seriesId) {
      // Get observations for known series
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=24`
      );
      if (!res.ok) throw new ProviderError(this.id, `HTTP ${res.status}`, res.status);
      const observations = await res.json();

      // Also get series info
      const infoRes = await fetch(
        `https://api.stlouisfed.org/fred/series?series_id=${seriesId}&api_key=${apiKey}&file_type=json`
      );
      const info = infoRes.ok ? await infoRes.json() : null;

      data = { observations, info, series_id: seriesId };
    } else {
      // Search for series
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/search?search_text=${encodeURIComponent(
          params.query
        )}&api_key=${apiKey}&file_type=json&limit=${params.limit}`
      );
      if (!res.ok) throw new ProviderError(this.id, `HTTP ${res.status}`, res.status);
      data = await res.json();
    }

    return {
      raw: data,
      status: 200,
      latency_ms: Date.now() - start,
      cost_eur: 0, // Free API
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = getEnvVar("FRED_API_KEY");
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=${apiKey}&file_type=json`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
