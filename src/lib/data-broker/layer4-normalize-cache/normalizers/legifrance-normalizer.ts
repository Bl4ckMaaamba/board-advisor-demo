import { DataPacket } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface LegifranceResult {
  titles?: Array<{ title?: string }>;
  id?: string;
  origin?: string;
  nature?: string;
  text?: string;
}

interface LegifranceResponse {
  results?: LegifranceResult[];
  totalResultNumber?: number;
}

export class LegifranceNormalizer implements ResponseNormalizer<LegifranceResponse> {
  normalize(raw: LegifranceResponse, queryId: string): DataPacket[] {
    const results = raw.results ?? [];
    const now = new Date().toISOString();

    return results.map((result): DataPacket => {
      const title = result.titles?.[0]?.title ?? result.nature ?? "Document juridique";
      const summary = result.text?.substring(0, 500) ?? "";

      return {
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "legifrance",
        category: "legal",
        data_type: "document",
        content: {
          title,
          summary,
          source_name: "Légifrance",
          document_type: result.nature ?? "texte_loi",
          url: result.id
            ? `https://www.legifrance.gouv.fr/jorf/id/${result.id}`
            : null,
          full_text: null,
        },
        confidence: 0.95,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("legal", "document"),
        source_url: result.id
          ? `https://www.legifrance.gouv.fr/jorf/id/${result.id}`
          : null,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      };
    });
  }
}
