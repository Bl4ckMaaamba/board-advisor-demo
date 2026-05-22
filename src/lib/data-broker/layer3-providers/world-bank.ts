import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { ProviderError } from "../utils/errors";

const INDICATOR_MAP: Record<string, string> = {
  pib: "NY.GDP.MKTP.CD",
  gdp: "NY.GDP.MKTP.CD",
  inflation: "FP.CPI.TOTL.ZG",
  population: "SP.POP.TOTL",
  dette: "GC.DOD.TOTL.GD.ZS",
  commerce: "NE.TRD.GNFS.ZS",
  chômage: "SL.UEM.TOTL.ZS",
};

export class WorldBankProvider implements ProviderAdapter {
  id = "world_bank";
  name = "World Bank";
  categories: DataCategory[] = ["macro"];
  baseConfidence = 0.9;
  defaultTimeoutMs = 5000;
  fallbackId = null;

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const start = Date.now();

    const lower = params.query.toLowerCase();
    let indicator = "NY.GDP.MKTP.CD"; // default to GDP
    for (const [keyword, id] of Object.entries(INDICATOR_MAP)) {
      if (lower.includes(keyword)) {
        indicator = id;
        break;
      }
    }

    // Default to France
    const countryEntity = params.entities.find((e) => e.type === "country");
    const country = countryEntity?.name?.substring(0, 3).toUpperCase() ?? "FRA";

    const response = await fetch(
      `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=20&date=2015:2025`
    );

    if (!response.ok) {
      throw new ProviderError(this.id, `HTTP ${response.status}`, response.status);
    }

    return {
      raw: await response.json(),
      status: response.status,
      latency_ms: Date.now() - start,
      cost_eur: 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        "https://api.worldbank.org/v2/country/FRA/indicator/NY.GDP.MKTP.CD?format=json&per_page=1"
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
