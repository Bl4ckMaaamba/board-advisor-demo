import { DataPacket, MetricContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface FmpProfile {
  symbol?: string;
  companyName?: string;
  price?: number;
  marketCap?: number;
  beta?: number;
  lastDividend?: number;
  sector?: string;
  industry?: string;
  country?: string;
  currency?: string;
  // Legacy fields
  name?: string;
  stockExchange?: string;
}

interface FmpRatios {
  peRatioTTM?: number;
  priceToBookRatioTTM?: number;
  debtEquityRatioTTM?: number;
  returnOnEquityTTM?: number;
  currentRatioTTM?: number;
  dividendYielTTM?: number;
  enterpriseValueMultipleTTM?: number;
  priceEarningsToGrowthRatioTTM?: number;
  // Stable API field names
  peRatio?: number;
  priceToBookRatio?: number;
  debtEquityRatio?: number;
  returnOnEquity?: number;
  currentRatio?: number;
  dividendYield?: number;
  enterpriseValueMultiple?: number;
  priceEarningsToGrowthRatio?: number;
  [key: string]: unknown;
}

interface FmpResponse {
  search?: FmpProfile[];
  ratios?: FmpRatios[];
}

export class FmpNormalizer implements ResponseNormalizer<FmpResponse> {
  normalize(raw: FmpResponse, queryId: string): DataPacket[] {
    const now = new Date().toISOString();
    const packets: DataPacket[] = [];

    const profiles = raw.search ?? [];
    const company = profiles[0]?.companyName ?? profiles[0]?.name ?? "Unknown";
    const symbol = profiles[0]?.symbol ?? "";

    // Profile-based metrics (price, marketCap)
    if (profiles.length > 0 && profiles[0].price) {
      const p = profiles[0];

      const profileMetrics: [string, number | undefined, string | null][] = [
        ["price", p.price, p.currency ?? "USD"],
        ["market_cap", p.marketCap, p.currency ?? "USD"],
        ["beta", p.beta, null],
        ["last_dividend", p.lastDividend, p.currency ?? "USD"],
      ];

      for (const [name, value, unit] of profileMetrics) {
        if (value !== undefined && value !== null && value !== 0) {
          packets.push({
            id: crypto.randomUUID(),
            query_id: queryId,
            provider: "fmp",
            category: "finance",
            data_type: "metric",
            content: {
              name,
              value: Math.round(value * 100) / 100,
              unit,
              period: null,
              entity: `${company} (${symbol})`,
            } as MetricContent,
            confidence: 0.85,
            freshness: now,
            retrieved_at: now,
            ttl: getTtlForCategory("finance", "metric"),
            source_url: null,
            cost_eur: 0,
            latency_ms: 0,
            conflicts: null,
          });
        }
      }
    }

    // Handle ratios data
    if (raw.ratios && Array.isArray(raw.ratios) && raw.ratios.length > 0) {
      const r = raw.ratios[0];

      const ratioMap: Record<string, { value: number | undefined; unit: string }> = {
        pe_ratio: { value: r.peRatioTTM ?? r.peRatio, unit: "x" },
        price_to_book: { value: r.priceToBookRatioTTM ?? r.priceToBookRatio, unit: "x" },
        debt_equity: { value: r.debtEquityRatioTTM ?? r.debtEquityRatio, unit: "x" },
        roe: { value: r.returnOnEquityTTM ?? r.returnOnEquity, unit: "%" },
        current_ratio: { value: r.currentRatioTTM ?? r.currentRatio, unit: "x" },
        dividend_yield: { value: r.dividendYielTTM ?? r.dividendYield, unit: "%" },
        ev_ebitda: { value: r.enterpriseValueMultipleTTM ?? r.enterpriseValueMultiple, unit: "x" },
        peg_ratio: { value: r.priceEarningsToGrowthRatioTTM ?? r.priceEarningsToGrowthRatio, unit: "x" },
      };

      for (const [name, info] of Object.entries(ratioMap)) {
        if (info.value !== undefined && info.value !== null) {
          packets.push({
            id: crypto.randomUUID(),
            query_id: queryId,
            provider: "fmp",
            category: "finance",
            data_type: "metric",
            content: {
              name,
              value: Math.round(info.value * 100) / 100,
              unit: info.unit,
              period: "TTM",
              entity: company,
            } as MetricContent,
            confidence: 0.85,
            freshness: now,
            retrieved_at: now,
            ttl: getTtlForCategory("finance", "metric"),
            source_url: null,
            cost_eur: 0,
            latency_ms: 0,
            conflicts: null,
          });
        }
      }
    }

    return packets;
  }
}
