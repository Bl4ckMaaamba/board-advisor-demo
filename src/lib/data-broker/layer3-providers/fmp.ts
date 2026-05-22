import { ProviderAdapter, ProviderQueryParams, RawProviderResponse } from "./types";
import { DataCategory } from "../schemas/data-packet";
import { getEnvVar } from "../utils/env";
import { ProviderError } from "../utils/errors";

// Common company name → ticker mapping for direct lookup
const TICKER_MAP: Record<string, string> = {
  // France (Euronext Paris)
  lvmh: "MC.PA", apple: "AAPL", microsoft: "MSFT", google: "GOOGL",
  amazon: "AMZN", tesla: "TSLA", meta: "META", nvidia: "NVDA",
  totalenergies: "TTE.PA", total: "TTE.PA", sanofi: "SAN.PA",
  bnp: "BNP.PA", "bnp paribas": "BNP.PA", "société générale": "GLE.PA",
  danone: "BN.PA", loreal: "OR.PA", "l'oréal": "OR.PA",
  hermes: "RMS.PA", hermès: "RMS.PA", kering: "KER.PA",
  airbus: "AIR.PA", renault: "RNO.PA", stellantis: "STLAM.MI",
  carrefour: "CA.PA", orange: "ORA.PA", engie: "ENGI.PA",
  veolia: "VIE.PA", schneider: "SU.PA", saint_gobain: "SGO.PA",
  "saint-gobain": "SGO.PA", pernod: "RI.PA", "pernod ricard": "RI.PA",
  michelin: "ML.PA", axa: "CS.PA", "crédit agricole": "ACA.PA",
  vinci: "DG.PA", safran: "SAF.PA", thales: "HO.PA", dassault: "AM.PA",
  // US banks
  jpmorgan: "JPM", goldman: "GS", "bank of america": "BAC",
  // Germany (XETRA)
  siemens: "SIE.DE", sap: "SAP.DE", bmw: "BMW.DE", volkswagen: "VOW3.DE",
  adidas: "ADS.DE", "deutsche bank": "DBK.DE", allianz: "ALV.DE", bayer: "BAYN.DE",
  basf: "BAS.DE", "mercedes-benz": "MBG.DE", mercedes: "MBG.DE",
  // Netherlands (Euronext Amsterdam)
  asml: "ASML.AS", philips: "PHIA.AS", ing: "INGA.AS", unilever: "UNA.AS",
  // Switzerland (SIX)
  nestle: "NESN.SW", nestlé: "NESN.SW", roche: "ROG.SW", novartis: "NOVN.SW",
  abb: "ABBN.SW", "credit suisse": "CSGN.SW", ubs: "UBSG.SW",
  // Italy (Borsa Italiana)
  enel: "ENEL.MI", intesa: "ISP.MI", eni: "ENI.MI", ferrari: "RACE.MI",
  // Spain (BME)
  inditex: "ITX.MC", santander: "SAN.MC", bbva: "BBVA.MC", telefonica: "TEF.MC",
  // UK (LSE)
  "bp": "BP.L", shell: "SHEL.L", hsbc: "HSBA.L", astrazeneca: "AZN.L",
  gsk: "GSK.L", rio: "RIO.L", "rio tinto": "RIO.L",
  // Nordics
  nokia: "NOKIA.HE", ericsson: "ERIC-B.ST", "novo nordisk": "NOVO-B.CO",
};

function resolveSymbol(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Try full name
  if (TICKER_MAP[lower]) return TICKER_MAP[lower];
  // Try each word individually (handles "LVMH Moët Hennessy" → matches "lvmh")
  for (const word of lower.split(/\s+/)) {
    if (TICKER_MAP[word]) return TICKER_MAP[word];
  }
  // If it looks like a ticker already (all caps, 1-5 chars, optional .XX suffix)
  if (/^[A-Z]{1,5}(\.[A-Z]{1,3})?$/.test(name.trim())) return name.trim();
  return null;
}

export class FmpProvider implements ProviderAdapter {
  id = "fmp";
  name = "Financial Modeling Prep";
  categories: DataCategory[] = ["finance"];
  baseConfidence = 0.85;
  defaultTimeoutMs = 5000;
  fallbackId = null;

  private get apiKey() {
    return getEnvVar("FMP_API_KEY");
  }

  async query(params: ProviderQueryParams): Promise<RawProviderResponse> {
    const start = Date.now();

    // Priority 1: Explicit [TICKER: XXX] marker from agent tool enrichment
    const tickerMatch = params.query.match(/\[TICKER:\s*([^\]]+)\]/i);
    let symbol: string | null = null;

    if (tickerMatch) {
      const explicit = tickerMatch[1].trim();
      // If it looks like a valid ticker, use directly; otherwise try resolving
      symbol = /^[A-Z0-9]{1,6}([.-][A-Z]{1,3})?$/i.test(explicit)
        ? explicit.toUpperCase()
        : resolveSymbol(explicit);
    }

    // Priority 2: Entity-based resolution
    if (!symbol) {
      const companyEntity = params.entities.find(
        (e) => e.type === "company" || e.type === "entity"
      );
      symbol = companyEntity
        ? resolveSymbol(companyEntity.name)
        : resolveSymbol(params.query);
    }

    if (!symbol) {
      // No recognizable ticker — return empty (let Brave/Pappers handle it)
      return { raw: { search: [], ratios: [] }, status: 200, latency_ms: 0, cost_eur: 0 };
    }

    // Fetch profile (works on all plans)
    const profileUrl = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const profileRes = await fetch(profileUrl);

    if (!profileRes.ok) {
      throw new ProviderError(this.id, `HTTP ${profileRes.status}`, profileRes.status);
    }

    const profileData = await profileRes.json();

    // Try to fetch ratios (may fail for non-US on free plan)
    let ratiosData: unknown[] = [];
    try {
      const ratiosRes = await fetch(
        `https://financialmodelingprep.com/stable/ratios?symbol=${encodeURIComponent(symbol)}&period=annual&limit=1&apikey=${this.apiKey}`
      );
      if (ratiosRes.ok) {
        const text = await ratiosRes.text();
        // Check for premium error messages
        if (text.startsWith("[")) {
          ratiosData = JSON.parse(text);
        }
      }
    } catch {
      // Ratios not available on this plan for this symbol
    }

    return {
      raw: { search: Array.isArray(profileData) ? profileData : [profileData], ratios: ratiosData },
      status: 200,
      latency_ms: Date.now() - start,
      cost_eur: 0.001,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${this.apiKey}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
