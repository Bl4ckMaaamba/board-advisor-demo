import { DataPacket, TimeseriesContent, MetricContent } from "../../schemas/data-packet";
import { ResponseNormalizer } from "./types";
import { getTtlForCategory } from "../cache/ttl-config";

interface FredObservation {
  date: string;
  value: string;
}

interface FredSeriesInfo {
  id: string;
  title: string;
  units: string;
  frequency: string;
}

interface FredResponse {
  observations?: { observations?: FredObservation[] };
  info?: { seriess?: FredSeriesInfo[] };
  series_id?: string;
  seriess?: FredSeriesInfo[];
}

export class FredNormalizer implements ResponseNormalizer<FredResponse> {
  normalize(raw: FredResponse, queryId: string): DataPacket[] {
    const now = new Date().toISOString();

    // Handle timeseries response
    if (raw.observations?.observations) {
      const observations = raw.observations.observations.filter(
        (o) => o.value !== "."
      );
      const seriesInfo = raw.info?.seriess?.[0];

      const datapoints = observations.map((o) => ({
        date: o.date,
        value: parseFloat(o.value),
      }));

      const content: TimeseriesContent = {
        name: seriesInfo?.title ?? raw.series_id ?? "FRED Series",
        unit: seriesInfo?.units ?? "",
        frequency: seriesInfo?.frequency ?? "monthly",
        datapoints,
      };

      // Also create a "latest value" metric
      const packets: DataPacket[] = [];

      packets.push({
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "fred",
        category: "macro",
        data_type: "timeseries",
        content,
        confidence: 0.95,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("macro", "timeseries"),
        source_url: `https://fred.stlouisfed.org/series/${raw.series_id}`,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      });

      if (datapoints.length > 0) {
        const latest = datapoints[0]; // sorted desc
        const metricContent: MetricContent = {
          name: seriesInfo?.title ?? raw.series_id ?? "FRED",
          value: latest.value,
          unit: seriesInfo?.units ?? "",
          period: latest.date,
          entity: "FRED",
        };

        packets.push({
          id: crypto.randomUUID(),
          query_id: queryId,
          provider: "fred",
          category: "macro",
          data_type: "metric",
          content: metricContent,
          confidence: 0.95,
          freshness: now,
          retrieved_at: now,
          ttl: getTtlForCategory("macro", "metric"),
          source_url: `https://fred.stlouisfed.org/series/${raw.series_id}`,
          cost_eur: 0,
          latency_ms: 0,
          conflicts: null,
        });
      }

      return packets;
    }

    // Handle search response
    if (raw.seriess) {
      return raw.seriess.slice(0, 5).map((series): DataPacket => ({
        id: crypto.randomUUID(),
        query_id: queryId,
        provider: "fred",
        category: "macro",
        data_type: "metric",
        content: {
          name: series.title,
          value: 0,
          unit: series.units,
          period: null,
          entity: `FRED:${series.id}`,
        },
        confidence: 0.95,
        freshness: now,
        retrieved_at: now,
        ttl: getTtlForCategory("macro", "metric"),
        source_url: `https://fred.stlouisfed.org/series/${series.id}`,
        cost_eur: 0,
        latency_ms: 0,
        conflicts: null,
      }));
    }

    return [];
  }
}
