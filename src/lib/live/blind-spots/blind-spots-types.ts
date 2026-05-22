/**
 * Types pour le pipeline Blind Spots (angles morts).
 * Spec: specs/features/blind-spots.md
 */

export type BlindSpotType = "docs" | "memory" | "external";
export type BlindSpotSeverity = "critical" | "warning" | "info";
export type BlindSpotDomain =
  | "finance"
  | "strategie"
  | "juridique"
  | "operations"
  | "rh"
  | "esg"
  | "tech";

export type BlindSpotSourceType = "document" | "meeting_history" | "decision" | "web" | "api";

/** Source pour un angle mort de type "docs" */
export interface BlindSpotSourceDocs {
  kind: "document";
  document_id: string;
  document_name: string;
  chunk_id: string;
  section_title: string | null;
  excerpt: string;
}

/** Source pour un angle mort de type "memory" */
export interface BlindSpotSourceMemory {
  kind: "meeting_history" | "decision";
  meeting_id: string;
  meeting_date?: string;
  transcript_excerpt?: string;
  decision_id?: string;
}

/** Source pour un angle mort de type "external" */
export interface BlindSpotSourceExternal {
  kind: "web" | "api";
  url: string;
  title: string;
  published_at?: string;
  provider: string;
}

export type BlindSpotSource =
  | BlindSpotSourceDocs
  | BlindSpotSourceMemory
  | BlindSpotSourceExternal;

/** Résultat d'un détecteur (Stage 1 + Stage 2) — avant écriture en DB */
export interface BlindSpotResult {
  title: string;
  description: string;
  recommended_action?: string;
  type: BlindSpotType;
  severity: BlindSpotSeverity;
  domain?: BlindSpotDomain;
  source: BlindSpotSource;
  relevance_score: number;
  is_manual?: boolean;
  triggered_by_user_id?: string;
  trigger_query?: string;
}

/** Entrée DB complète (après persistance) */
export interface BlindSpotEntry {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  recommended_action: string | null;
  type: BlindSpotType;
  severity: BlindSpotSeverity;
  domain: BlindSpotDomain | null;
  source_type: BlindSpotSourceType;
  source_reference: BlindSpotSource;
  is_manual: boolean;
  triggered_by_user_id: string | null;
  trigger_query: string | null;
  relevance_score: number | null;
  created_at: string;
}

/** Sortie du Stage 2 (LLM JSON structuré) */
export interface BlindSpotStage2Output {
  emit: boolean;
  title?: string;
  description?: string;
  recommended_action?: string;
  severity?: BlindSpotSeverity;
  domain?: BlindSpotDomain;
  source?: BlindSpotSource;
}
