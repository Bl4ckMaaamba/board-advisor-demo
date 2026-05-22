import { z } from "zod/v4";

export const MetricContentSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  period: z.string().nullable(),
  entity: z.string(),
});

export const ArticleContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  source_name: z.string(),
  published_at: z.iso.datetime().nullable(),
  url: z.url(),
  relevance_score: z.number().min(0).max(1),
});

export const TimeseriesContentSchema = z.object({
  name: z.string(),
  unit: z.string(),
  frequency: z.string(),
  datapoints: z.array(
    z.object({
      date: z.string(),
      value: z.number(),
    })
  ),
});

export const DocumentContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  source_name: z.string(),
  document_type: z.string(),
  url: z.url().nullable(),
  full_text: z.string().nullable(),
});

export const RatingContentSchema = z.object({
  name: z.string(),
  score: z.number(),
  scale: z.string(),
  entity: z.string(),
  methodology: z.string().nullable(),
});

export const DataContentSchema = z.union([
  MetricContentSchema,
  ArticleContentSchema,
  TimeseriesContentSchema,
  DocumentContentSchema,
  RatingContentSchema,
]);

export const DataCategorySchema = z.enum([
  "finance",
  "press",
  "legal",
  "macro",
  "esg",
]);

export const DataTypeSchema = z.enum([
  "metric",
  "article",
  "document",
  "rating",
  "timeseries",
]);

export const ConflictSchema = z.object({
  field: z.string(),
  this_value: z.unknown(),
  other_provider: z.string(),
  other_value: z.unknown(),
  difference_pct: z.number().nullable(),
});

export const DataPacketSchema = z.object({
  id: z.string().uuid(),
  query_id: z.string().uuid(),
  provider: z.string(),
  category: DataCategorySchema,
  data_type: DataTypeSchema,
  content: DataContentSchema,
  confidence: z.number().min(0).max(1),
  freshness: z.iso.datetime(),
  retrieved_at: z.iso.datetime(),
  ttl: z.number().int().positive(),
  source_url: z.url().nullable(),
  cost_eur: z.number().min(0),
  latency_ms: z.number().int().min(0),
  conflicts: z.array(ConflictSchema).nullable(),
});

export type DataPacket = z.infer<typeof DataPacketSchema>;
export type MetricContent = z.infer<typeof MetricContentSchema>;
export type ArticleContent = z.infer<typeof ArticleContentSchema>;
export type TimeseriesContent = z.infer<typeof TimeseriesContentSchema>;
export type DocumentContent = z.infer<typeof DocumentContentSchema>;
export type RatingContent = z.infer<typeof RatingContentSchema>;
export type DataCategory = z.infer<typeof DataCategorySchema>;
export type DataType = z.infer<typeof DataTypeSchema>;
export type Conflict = z.infer<typeof ConflictSchema>;
