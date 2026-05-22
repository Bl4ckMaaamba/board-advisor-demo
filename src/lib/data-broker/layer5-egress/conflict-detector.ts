import { DataPacket, Conflict, MetricContent } from "../schemas/data-packet";

const CONFLICT_THRESHOLD_PCT = 5;

function isMetric(content: unknown): content is MetricContent {
  return (
    typeof content === "object" &&
    content !== null &&
    "name" in content &&
    "value" in content
  );
}

export function detectConflicts(packets: DataPacket[]): DataPacket[] {
  // Group metric packets by entity+name
  const metricGroups = new Map<string, DataPacket[]>();

  for (const packet of packets) {
    if (packet.data_type === "metric" && isMetric(packet.content)) {
      const key = `${packet.content.entity}:${packet.content.name}`.toLowerCase();
      if (!metricGroups.has(key)) {
        metricGroups.set(key, []);
      }
      metricGroups.get(key)!.push(packet);
    }
  }

  // Detect conflicts within groups
  const conflictMap = new Map<string, Conflict[]>();

  const groupKeys = Array.from(metricGroups.keys());
  for (const gk of groupKeys) {
    const group = metricGroups.get(gk)!;
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i].content as MetricContent;
        const b = group[j].content as MetricContent;

        if (a.value === 0 && b.value === 0) continue;

        const avg = (Math.abs(a.value) + Math.abs(b.value)) / 2;
        const diffPct = avg > 0 ? (Math.abs(a.value - b.value) / avg) * 100 : 0;

        if (diffPct > CONFLICT_THRESHOLD_PCT) {
          const conflict: Conflict = {
            field: a.name,
            this_value: a.value,
            other_provider: group[j].provider,
            other_value: b.value,
            difference_pct: Math.round(diffPct * 100) / 100,
          };

          // Add conflict to packet i
          if (!conflictMap.has(group[i].id)) {
            conflictMap.set(group[i].id, []);
          }
          conflictMap.get(group[i].id)!.push(conflict);

          // Add reverse conflict to packet j
          const reverseConflict: Conflict = {
            field: b.name,
            this_value: b.value,
            other_provider: group[i].provider,
            other_value: a.value,
            difference_pct: Math.round(diffPct * 100) / 100,
          };
          if (!conflictMap.has(group[j].id)) {
            conflictMap.set(group[j].id, []);
          }
          conflictMap.get(group[j].id)!.push(reverseConflict);
        }
      }
    }
  }

  // Apply conflicts to packets
  return packets.map((packet) => {
    const conflicts = conflictMap.get(packet.id);
    if (conflicts) {
      return { ...packet, conflicts };
    }
    return packet;
  });
}
