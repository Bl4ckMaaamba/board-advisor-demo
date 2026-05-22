import { Redis } from "@upstash/redis";
import { DataPacket } from "../../schemas/data-packet";
import { getEnvVar } from "../../utils/env";
import { brokerLogger } from "../../utils/logger";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: getEnvVar("UPSTASH_REDIS_REST_URL"),
      token: getEnvVar("UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return redis;
}

const CACHE_PREFIX = "db:cache:";

export const l2Cache = {
  async get(key: string): Promise<DataPacket[] | null> {
    try {
      const data = await getRedis().get<DataPacket[]>(`${CACHE_PREFIX}${key}`);
      return data ?? null;
    } catch (error) {
      brokerLogger.warn("L2 cache get failed", { key, error: String(error) });
      return null;
    }
  },

  async set(key: string, packets: DataPacket[], ttlSeconds: number): Promise<void> {
    try {
      await getRedis().set(`${CACHE_PREFIX}${key}`, packets, { ex: ttlSeconds });
    } catch (error) {
      brokerLogger.warn("L2 cache set failed", { key, error: String(error) });
    }
  },

  async invalidate(key: string): Promise<void> {
    try {
      await getRedis().del(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      brokerLogger.warn("L2 cache invalidate failed", { key, error: String(error) });
    }
  },

  async ping(): Promise<boolean> {
    try {
      const result = await getRedis().ping();
      return result === "PONG";
    } catch {
      return false;
    }
  },
};
