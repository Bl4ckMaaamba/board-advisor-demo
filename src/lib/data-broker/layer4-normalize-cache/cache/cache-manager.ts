import { DataPacket } from "../../schemas/data-packet";
import { brokerLogger } from "../../utils/logger";
import { l1Cache } from "./l1-memory";
import { l2Cache } from "./l2-redis";
import { l3Cache } from "./l3-supabase";

export function buildCacheKey(
  intent: string,
  entities: string[],
  providerId: string
): string {
  const sortedEntities = [...entities].sort().join(",");
  return `${intent}:${sortedEntities}:${providerId}`;
}

export const cacheManager = {
  async get(key: string): Promise<{ packets: DataPacket[]; level: string } | null> {
    // L1 — in-memory
    const l1Result = l1Cache.get(key);
    if (l1Result) {
      brokerLogger.debug("Cache hit L1", { key });
      return { packets: l1Result, level: "L1" };
    }

    // L2 — Redis
    const l2Result = await l2Cache.get(key);
    if (l2Result) {
      brokerLogger.debug("Cache hit L2", { key });
      l1Cache.set(key, l2Result, 300); // promote to L1
      return { packets: l2Result, level: "L2" };
    }

    // L3 — Supabase
    const l3Result = await l3Cache.get(key);
    if (l3Result) {
      brokerLogger.debug("Cache hit L3", { key });
      l1Cache.set(key, l3Result, 300); // promote to L1
      await l2Cache.set(key, l3Result, 3600); // promote to L2 (1h)
      return { packets: l3Result, level: "L3" };
    }

    return null;
  },

  async set(key: string, packets: DataPacket[], ttlSeconds: number): Promise<void> {
    // Always write to L1
    l1Cache.set(key, packets, ttlSeconds);

    // L2 if TTL >= 5 minutes
    if (ttlSeconds >= 300) {
      await l2Cache.set(key, packets, ttlSeconds);
    }

    // L3 if TTL >= 24 hours
    if (ttlSeconds >= 86400) {
      await l3Cache.set(key, packets, ttlSeconds);
    }
  },

  async invalidate(key: string): Promise<void> {
    l1Cache.invalidate(key);
    await Promise.all([l2Cache.invalidate(key), l3Cache.invalidate(key)]);
  },
};
