import { DataPacket, MetricContent } from "../schemas/data-packet";
import { detectConflicts } from "./conflict-detector";
import { tagSources } from "./source-tagger";

function isMetric(content: unknown): content is MetricContent {
  return (
    typeof content === "object" &&
    content !== null &&
    "name" in content &&
    "value" in content
  );
}

function deduplicateMetrics(packets: DataPacket[]): DataPacket[] {
  const seen = new Map<string, DataPacket>();
  const nonMetrics: DataPacket[] = [];

  for (const packet of packets) {
    if (packet.data_type === "metric" && isMetric(packet.content)) {
      const key = `${packet.content.entity}:${packet.content.name}`.toLowerCase();
      const existing = seen.get(key);

      if (!existing || packet.confidence > existing.confidence) {
        seen.set(key, packet);
      }
    } else {
      nonMetrics.push(packet);
    }
  }

  return Array.from(seen.values()).concat(nonMetrics);
}

function deduplicateArticles(packets: DataPacket[]): DataPacket[] {
  const seen = new Map<string, DataPacket>();
  const nonArticles: DataPacket[] = [];

  for (const packet of packets) {
    if (packet.data_type === "article" && packet.source_url) {
      if (!seen.has(packet.source_url)) {
        seen.set(packet.source_url, packet);
      } else {
        const existing = seen.get(packet.source_url)!;
        if (packet.confidence > existing.confidence) {
          seen.set(packet.source_url, packet);
        }
      }
    } else {
      nonArticles.push(packet);
    }
  }

  return Array.from(seen.values()).concat(nonArticles);
}

export function mergeResults(packets: DataPacket[]): DataPacket[] {
  // Step 1: Deduplicate
  let merged = deduplicateMetrics(packets);
  merged = deduplicateArticles(merged);

  // Step 2: Detect conflicts (on the full set before dedup for comparison)
  merged = detectConflicts(merged);

  // Step 3: Tag sources
  merged = tagSources(merged);

  // Step 4: Sort by confidence (highest first)
  merged.sort((a, b) => b.confidence - a.confidence);

  return merged;
}
