import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DataPacket } from "../../schemas/data-packet";
import { brokerLogger } from "../../utils/logger";

const TABLE_NAME = "data_broker_cache";

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url === "your-supabase-url" || !url.startsWith("http")) {
    return null;
  }
  return createClient(url, key);
}

export const l3Cache = {
  async get(key: string): Promise<DataPacket[] | null> {
    try {
      const client = getClient();
      if (!client) return null;

      const { data, error } = await client
        .from(TABLE_NAME)
        .select("packets")
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) return null;
      return data.packets as DataPacket[];
    } catch (error) {
      brokerLogger.warn("L3 cache get failed", { key, error: String(error) });
      return null;
    }
  },

  async set(key: string, packets: DataPacket[], ttlSeconds: number): Promise<void> {
    try {
      const client = getClient();
      if (!client) return;

      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      await client.from(TABLE_NAME).upsert(
        {
          cache_key: key,
          packets: packets,
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: "cache_key" }
      );
    } catch (error) {
      brokerLogger.warn("L3 cache set failed", { key, error: String(error) });
    }
  },

  async invalidate(key: string): Promise<void> {
    try {
      const client = getClient();
      if (!client) return;

      await client.from(TABLE_NAME).delete().eq("cache_key", key);
    } catch (error) {
      brokerLogger.warn("L3 cache invalidate failed", { key, error: String(error) });
    }
  },
};
