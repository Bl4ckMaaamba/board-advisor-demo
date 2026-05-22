import { ResponseNormalizer } from "./types";
import { BraveNormalizer } from "./brave-normalizer";
import { TavilyNormalizer } from "./tavily-normalizer";
import { FmpNormalizer } from "./fmp-normalizer";
import { PappersNormalizer } from "./pappers-normalizer";
import { LegifranceNormalizer } from "./legifrance-normalizer";
import { FredNormalizer } from "./fred-normalizer";
import { NewsApiNormalizer } from "./newsapi-normalizer";
import {
  WorldBankNormalizer,
  OpenCorporatesNormalizer,
  GoogleNewsRssNormalizer,
} from "./free-api-normalizers";

const normalizers: Record<string, ResponseNormalizer> = {
  brave_search: new BraveNormalizer(),
  tavily: new TavilyNormalizer(),
  fmp: new FmpNormalizer(),
  pappers: new PappersNormalizer(),
  legifrance: new LegifranceNormalizer(),
  fred: new FredNormalizer(),
  newsapi: new NewsApiNormalizer(),
  world_bank: new WorldBankNormalizer(),
  opencorporates: new OpenCorporatesNormalizer(),
  google_news_rss: new GoogleNewsRssNormalizer(),
};

export function getNormalizer(providerId: string): ResponseNormalizer {
  const normalizer = normalizers[providerId];
  if (!normalizer) {
    throw new Error(`No normalizer registered for provider: ${providerId}`);
  }
  return normalizer;
}
