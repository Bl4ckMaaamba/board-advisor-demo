import { LRUCache } from "lru-cache";
import { DataPacket } from "../../schemas/data-packet";

const cache = new LRUCache<string, DataPacket[]>({
  max: 500,
  ttl: 5 * 60 * 1000, // 5 minutes default max
});

export const l1Cache = {
  get(key: string): DataPacket[] | null {
    return cache.get(key) ?? null;
  },

  set(key: string, packets: DataPacket[], ttlSeconds: number): void {
    const ttlMs = Math.min(ttlSeconds, 300) * 1000; // L1 max 5 minutes
    cache.set(key, packets, { ttl: ttlMs });
  },

  invalidate(key: string): void {
    cache.delete(key);
  },

  clear(): void {
    cache.clear();
  },

  size(): number {
    return cache.size;
  },
};
