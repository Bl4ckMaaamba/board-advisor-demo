import { ProviderAdapter } from "./types";
import { Intent } from "../schemas/query-plan";
import { BraveSearchProvider } from "./brave-search";
import { TavilyProvider } from "./tavily";
import { FmpProvider } from "./fmp";
import { PappersProvider } from "./pappers";
import { LegifranceProvider } from "./legifrance";
import { FredProvider } from "./fred";
import { NewsApiProvider } from "./newsapi";
import { WorldBankProvider } from "./world-bank";
import { OpenCorporatesProvider } from "./opencorporates";
import { GoogleNewsRssProvider } from "./google-news-rss";

const providers = new Map<string, ProviderAdapter>();

// Lazily initialized to avoid env var errors at import time
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const all: ProviderAdapter[] = [
    new BraveSearchProvider(),
    new TavilyProvider(),
    new FmpProvider(),
    new PappersProvider(),
    new LegifranceProvider(),
    new FredProvider(),
    new NewsApiProvider(),
    new WorldBankProvider(),
    new OpenCorporatesProvider(),
    new GoogleNewsRssProvider(),
  ];

  for (const provider of all) {
    providers.set(provider.id, provider);
  }
}

const INTENT_TO_PROVIDERS: Record<Intent, string[]> = {
  benchmark: ["fmp", "pappers", "brave_search"],
  fact_check: ["brave_search", "tavily", "newsapi"],
  news: ["newsapi", "google_news_rss", "tavily", "brave_search"],
  legal: ["legifrance"],
  macro: ["fred", "world_bank"],
  esg: ["brave_search", "tavily"],
};

export const providerRegistry = {
  getProvider(id: string): ProviderAdapter | undefined {
    ensureInitialized();
    return providers.get(id);
  },

  getProvidersForIntent(intent: Intent): ProviderAdapter[] {
    ensureInitialized();
    const ids = INTENT_TO_PROVIDERS[intent] ?? [];
    return ids
      .map((id) => providers.get(id))
      .filter((p): p is ProviderAdapter => p !== undefined);
  },

  getFallbackChain(id: string): string[] {
    ensureInitialized();
    const chain: string[] = [id];
    let current = providers.get(id);
    while (current?.fallbackId) {
      if (chain.includes(current.fallbackId)) break; // prevent cycles
      chain.push(current.fallbackId);
      current = providers.get(current.fallbackId);
    }
    return chain;
  },

  getAllProviders(): ProviderAdapter[] {
    ensureInitialized();
    return Array.from(providers.values());
  },
};
