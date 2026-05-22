import { DataPacket } from "@/lib/data-broker/schemas/data-packet";
import { SourceRef } from "./types";

interface MetricContent {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  entity: string;
}

interface ArticleContent {
  title: string;
  summary: string;
  source_name: string;
  published_at: string | null;
  url: string;
  relevance_score: number;
}

interface TimeseriesContent {
  name: string;
  unit: string;
  frequency: string;
  datapoints: Array<{ date: string; value: number }>;
}

interface DocumentContent {
  title: string;
  summary: string;
  source_name: string;
  document_type: string;
  url: string | null;
}

interface RatingContent {
  name: string;
  score: number;
  scale: string;
  entity: string;
}

function formatMetric(content: MetricContent, provider: string, confidence: number): string {
  const unit = content.unit ? ` ${content.unit}` : "";
  const period = content.period ? ` (${content.period})` : "";
  return `[${provider}] (${Math.round(confidence * 100)}%) ${content.name}: ${content.value}${unit}${period} — ${content.entity}`;
}

function formatArticle(content: ArticleContent, provider: string, confidence: number): string {
  const date = content.published_at ? content.published_at.split("T")[0] : "date inconnue";
  return `[${provider}] (${Math.round(confidence * 100)}%) **${content.title}**
${content.summary}
Source : ${content.source_name}, ${date}
URL : ${content.url}`;
}

function formatTimeseries(content: TimeseriesContent, provider: string, confidence: number): string {
  const recent = content.datapoints.slice(-24);
  const points = recent.map((d) => `${d.date}: ${d.value}`).join(", ");

  // Calculate trend if enough data points
  let trend = "";
  if (recent.length >= 2) {
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    if (first !== 0) {
      const pctChange = ((last - first) / Math.abs(first)) * 100;
      trend = ` | Tendance: ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}% sur la période`;
    }
  }

  return `[${provider}] (${Math.round(confidence * 100)}%) ${content.name} (${content.unit}, ${content.frequency}): ${points}${trend}`;
}

function formatDocument(content: DocumentContent, provider: string, confidence: number): string {
  const url = content.url ? `\nURL : ${content.url}` : "";
  return `[${provider}] (${Math.round(confidence * 100)}%) **${content.title}** (${content.document_type})
${content.summary}
Source : ${content.source_name}${url}`;
}

function formatRating(content: RatingContent, provider: string, confidence: number): string {
  return `[${provider}] (${Math.round(confidence * 100)}%) ${content.name}: ${content.score}/${content.scale} — ${content.entity}`;
}

function formatPacket(packet: DataPacket): string {
  const content = packet.content as Record<string, unknown>;
  const provider = packet.provider.toUpperCase();
  const confidence = packet.confidence;

  switch (packet.data_type) {
    case "metric":
      return formatMetric(content as unknown as MetricContent, provider, confidence);
    case "article":
      return formatArticle(content as unknown as ArticleContent, provider, confidence);
    case "timeseries":
      return formatTimeseries(content as unknown as TimeseriesContent, provider, confidence);
    case "document":
      return formatDocument(content as unknown as DocumentContent, provider, confidence);
    case "rating":
      return formatRating(content as unknown as RatingContent, provider, confidence);
    default:
      return `[${provider}] (${Math.round(confidence * 100)}%) ${JSON.stringify(content).substring(0, 500)}`;
  }
}

export function formatPackets(packets: DataPacket[]): string {
  if (packets.length === 0) {
    return "Aucun résultat trouvé.";
  }

  const formatted = packets.map(formatPacket);

  // Append conflict warnings
  const conflicts = packets
    .filter((p) => p.conflicts && p.conflicts.length > 0)
    .flatMap((p) =>
      (p.conflicts ?? []).map(
        (c) =>
          `⚠ Conflit détecté sur "${c.field}": ${p.provider} indique ${String(c.this_value)}, ${c.other_provider} indique ${String(c.other_value)}${c.difference_pct != null ? ` (écart: ${c.difference_pct.toFixed(1)}%)` : ""}`
      )
    );

  if (conflicts.length > 0) {
    formatted.push("\n--- Conflits entre sources ---\n" + conflicts.join("\n"));
  }

  return formatted.join("\n\n---\n\n");
}

export function extractSourcesFromPackets(packets: DataPacket[]): SourceRef[] {
  return packets.map((p) => ({
    name: p.provider,
    type: "external" as const,
    provider: p.provider,
    url: p.source_url ?? undefined,
    confidence: p.confidence,
  }));
}
