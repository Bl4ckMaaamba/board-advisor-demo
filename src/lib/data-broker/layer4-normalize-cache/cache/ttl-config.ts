export const TTL_BY_DATA_TYPE: Record<string, number> = {
  stock_prices: 300,         // 5 minutes
  financial_ratios: 2592000, // 30 jours
  press: 3600,               // 1 heure
  web_search: 1800,          // 30 minutes
  laws: 604800,              // 7 jours
  macro: 86400,              // 24 heures
  company_data: 604800,      // 7 jours
  esg: 2592000,              // 30 jours
};

export function getTtlForCategory(category: string, dataType: string): number {
  if (dataType === "timeseries" && category === "finance") return TTL_BY_DATA_TYPE.stock_prices;
  if (dataType === "metric" && category === "finance") return TTL_BY_DATA_TYPE.financial_ratios;
  if (dataType === "article") return TTL_BY_DATA_TYPE.press;
  if (category === "legal") return TTL_BY_DATA_TYPE.laws;
  if (category === "macro") return TTL_BY_DATA_TYPE.macro;
  if (category === "esg") return TTL_BY_DATA_TYPE.esg;
  if (category === "finance") return TTL_BY_DATA_TYPE.company_data;
  return TTL_BY_DATA_TYPE.web_search;
}
