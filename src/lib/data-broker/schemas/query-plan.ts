import { z } from "zod/v4";

export const IntentSchema = z.enum([
  "benchmark",
  "fact_check",
  "news",
  "legal",
  "macro",
  "esg",
]);

export const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const QueryClassificationSchema = z.object({
  intent: IntentSchema,
  entities: z.array(EntitySchema),
  language: z.string().default("fr"),
  confidence: z.number().min(0).max(1),
});

export const ProviderPlanSchema = z.object({
  provider_id: z.string(),
  priority: z.number().int().min(0).max(1),
  fallback_id: z.string().nullable(),
  timeout_ms: z.number().int().positive().default(5000),
});

export const QueryPlanSchema = z.object({
  query_id: z.string().uuid(),
  original_query: z.string(),
  classification: QueryClassificationSchema,
  providers: z.array(ProviderPlanSchema),
  execution_mode: z.enum(["parallel", "sequential"]).default("parallel"),
  latency_budget_ms: z.number().int().positive().default(4000),
  cost_budget_eur: z.number().positive().default(0.05),
});

export type Intent = z.infer<typeof IntentSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type QueryClassification = z.infer<typeof QueryClassificationSchema>;
export type ProviderPlan = z.infer<typeof ProviderPlanSchema>;
export type QueryPlan = z.infer<typeof QueryPlanSchema>;
