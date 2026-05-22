import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";
import { brokerLogger } from "../utils/logger";

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = getEnvVar("PISTE_CLIENT_ID");
  const clientSecret = getEnvVar("PISTE_CLIENT_SECRET");

  const response = await fetch("https://oauth.piste.gouv.fr/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid",
    }),
  });

  if (!response.ok) {
    throw new ProviderError("legifrance", `OAuth failed: ${response.status}`, response.status);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  brokerLogger.debug("Légifrance OAuth token refreshed");
  return cachedToken.token;
}

export class LegifranceProvider implements ProviderAdapter {
  id = "legifrance";
  name = "Légifrance (PISTE)";
  categories: DataCategory[] = ["legal"];
  baseConfidence = 0.95;
  defaultTimeoutMs = 8000;
  fallbackId = "brave_search";

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const token = await getOAuthToken();
    const start = Date.now();

    const response = await fetch(
      "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recherche: {
            champs: [
              {
                typeChamp: "ALL",
                criteres: [
                  {
                    typeRecherche: "UN_DES_MOTS",
                    valeur: params.query,
                    operateur: "ET",
                  },
                ],
                operateur: "ET",
              },
            ],
            filtres: [],
            pageNumber: 1,
            pageSize: Math.min(params.limit, 10),
            sort: "PERTINENCE",
            typePagination: "DEFAUT",
          },
          fond: "CODE_DATE",
        }),
      }
    );

    const latency = Date.now() - start;

    if (!response.ok) {
      // Throw to trigger fallback chain (brave_search for legal queries)
      throw new ProviderError(this.id, `HTTP ${response.status}`, response.status);
    }

    return {
      raw: await response.json(),
      status: response.status,
      latency_ms: latency,
      cost_eur: 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await getOAuthToken();
      return true;
    } catch {
      return false;
    }
  }
}
