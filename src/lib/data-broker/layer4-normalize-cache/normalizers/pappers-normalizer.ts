import { DataPacket, MetricContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface PappersEntreprise {
  nom_entreprise?: string;
  siren?: string;
  siege?: { ville?: string; code_postal?: string };
  chiffre_affaires?: number;
  resultat?: number;
  effectif?: string;
  date_creation?: string;
  forme_juridique?: string;
  dirigeants?: Array<{ nom?: string; prenom?: string; qualite?: string }>;
}

interface PappersResponse {
  search?: { resultats?: PappersEntreprise[] };
  details?: PappersEntreprise;
  resultats?: PappersEntreprise[];
}

export class PappersNormalizer implements ResponseNormalizer<PappersResponse> {
  normalize(raw: PappersResponse, queryId: string): DataPacket[] {
    const now = new Date().toISOString();
    const packets: DataPacket[] = [];

    const company = raw.details ?? raw.search?.resultats?.[0] ?? raw.resultats?.[0];
    if (!company) return packets;

    const entityName = company.nom_entreprise ?? "Entreprise inconnue";

    if (company.chiffre_affaires) {
      packets.push(this.createMetricPacket(queryId, now, {
        name: "chiffre_affaires",
        value: company.chiffre_affaires,
        unit: "€",
        period: null,
        entity: entityName,
      }));
    }

    if (company.resultat) {
      packets.push(this.createMetricPacket(queryId, now, {
        name: "resultat_net",
        value: company.resultat,
        unit: "€",
        period: null,
        entity: entityName,
      }));
    }

    if (company.effectif) {
      packets.push(this.createMetricPacket(queryId, now, {
        name: "effectif",
        value: parseInt(company.effectif) || 0,
        unit: "employés",
        period: null,
        entity: entityName,
      }));
    }

    // Add company info as a document-type packet
    if (company.siren) {
      packets.push({
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "pappers",
        category: "finance",
        data_type: "document",
        content: {
          title: entityName,
          summary: `SIREN: ${company.siren} | Forme: ${company.forme_juridique ?? "N/A"} | Ville: ${company.siege?.ville ?? "N/A"} | Création: ${company.date_creation ?? "N/A"}`,
          source_name: "Pappers (Greffe)",
          document_type: "fiche_entreprise",
          url: `https://www.pappers.fr/entreprise/${company.siren}`,
          full_text: null,
        },
        confidence: 0.9,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("finance", "document"),
        source_url: `https://www.pappers.fr/entreprise/${company.siren}`,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      });
    }

    return packets;
  }

  private createMetricPacket(
    queryId: string,
    now: string,
    content: MetricContent
  ): DataPacket {
    return {
      id: crypto.randomUUID(),
      query_id: queryId,
      provider: "pappers",
      category: "finance",
      data_type: "metric",
      content,
      confidence: 0.9,
      freshness: now,
      retrieved_at: now,
      ttl: getTtlForCategory("finance", "metric"),
      source_url: null,
      cost_eur: 0,
      latency_ms: 0,
      conflicts: null,
    };
  }
}
