import { DataCategory } from "../schemas/data-packet";
import { Entity } from "../schemas/query-plan";

export interface ProviderQueryParams {
  query: string;
  entities: Entity[];
  intent: string;
  sector: string | null;
  geo: string | null;
  limit: number;
}

export interface RawProviderResponse {
  raw: unknown;
  status: number;
  latency_ms: number;
  cost_eur: number;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  categories: DataCategory[];
  baseConfidence: number;
  defaultTimeoutMs: number;
  fallbackId: string | null;
  query(params: ProviderQueryParams): Promise<RawProviderResponse>;
  healthCheck(): Promise<boolean>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  categories: DataCategory[];
  baseConfidence: number;
  defaultTimeoutMs: number;
  fallbackId: string | null;
  apiKeyEnvVar: string;
  baseUrl: string;
}
