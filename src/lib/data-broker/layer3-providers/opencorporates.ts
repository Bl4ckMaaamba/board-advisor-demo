import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { ProviderError } from "../utils/errors";

export class OpenCorporatesProvider implements ProviderAdapter {
  id = "opencorporates";
  name = "OpenCorporates";
  categories: DataCategory[] = ["finance"];
  baseConfidence = 0.6;
  defaultTimeoutMs = 5000;
  fallbackId = null;

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const start = Date.now();

    const companyEntity = params.entities.find(
      (e) => e.type === "company" || e.type === "entity"
    );
    const searchQuery = companyEntity?.name ?? params.query;

    const response = await fetch(
      `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(
        searchQuery
      )}&per_page=${Math.min(params.limit, 10)}`
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
        "https://api.opencorporates.com/v0.4/companies/search?q=test&per_page=1"
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
