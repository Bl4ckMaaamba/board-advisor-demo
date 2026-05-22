import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

export class PappersProvider implements ProviderAdapter {
  id = "pappers";
  name = "Pappers";
  categories: DataCategory[] = ["finance"];
  baseConfidence = 0.9;
  defaultTimeoutMs = 5000;
  fallbackId = "opencorporates";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const apiKey = getEnvVar("PAPPERS_API_KEY");
    const start = Date.now();

    const companyEntity = params.entities.find(
      (e) => e.type === "company" || e.type === "entity"
    );
    const searchQuery = companyEntity?.name ?? params.query;

    // Search for company
    const searchParams = new URLSearchParams({
      api_token: apiKey,
      q: searchQuery,
      par_page: String(Math.min(params.limit, 10)),
    });

    const response = await fetch(
      `https://api.pappers.fr/v2/recherche?${searchParams}`
    );
    if (!response.ok) {
      throw new ProviderError(this.id, `HTTP ${response.status}`, response.status);
    }

    const data = await response.json();

    // If we found a company, get its full details
    let enrichedData = data;
    if (data.resultats?.length > 0) {
      const siren = data.resultats[0].siren;
      if (siren) {
        try {
          const detailRes = await fetch(
            `https://api.pappers.fr/v2/entreprise?api_token=${apiKey}&siren=${siren}`
          );
          if (detailRes.ok) {
            const details = await detailRes.json();
            enrichedData = { search: data, details };
          }
        } catch {
          // Keep search results if detail fetch fails
        }
      }
    }

    return {
      raw: enrichedData,
      status: response.status,
      latency_ms: Date.now() - start,
      cost_eur: 0.003, // ~2-5 credits per request
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = getEnvVar("PAPPERS_API_KEY");
      const res = await fetch(
        `https://api.pappers.fr/v2/recherche?api_token=${apiKey}&q=test&par_page=1`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
