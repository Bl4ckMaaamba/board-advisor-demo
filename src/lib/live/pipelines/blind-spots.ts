/**
 * Pipeline Blind Spots — entry point.
 *
 * Coordonne les 3 détecteurs (A: docs, B: memory, C: external) et applique
 * la logique de quota / dedup. En V1, seul le détecteur A est branché.
 *
 * Spec: specs/features/blind-spots.md § 8.5
 */

import { detectDocs } from "../blind-spots/detectors/detector-docs";
import { detectExternal } from "../blind-spots/detectors/detector-external";
import { detectMemory } from "../blind-spots/detectors/detector-memory";
import {
  canEmit,
  canEmitForDomain,
  isDuplicate,
  recordEmission,
  getRecentEmissionsText,
} from "../blind-spots";
import type { BlindSpotResult } from "../blind-spots";
import { liveLogger } from "../utils/logger";

export interface BlindSpotsPipelineContext {
  meetingId: string;
  boardId: string | null;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  recentTranscript: string;
  /** Si fourni, mode manuel : on bypass certaines limites et on cible le sujet. */
  triggerQuery?: string;
  triggeredByUserId?: string;
  /** Quels détecteurs activer (par défaut tous, mais Type B et C non implémentés en V1) */
  enabledDetectors?: { docs: boolean; memory: boolean; external: boolean };
}

/**
 * Run du pipeline. Retourne le ou les angles morts à persister.
 * Filtre via quota et dedup.
 */
export async function runBlindSpotsPipeline(
  ctx: BlindSpotsPipelineContext
): Promise<BlindSpotResult[]> {
  const isManual = !!ctx.triggerQuery;
  const detectors = ctx.enabledDetectors ?? { docs: true, memory: false, external: false };

  // Quota global (hors mode manuel : le manuel bypass le quota)
  if (!isManual) {
    if (!canEmit(ctx.meetingId, "warning")) {
      liveLogger.info("blind-spots quota reached, skipping", { meeting_id: ctx.meetingId });
      return [];
    }
  }

  const previousEmissions = getRecentEmissionsText(ctx.meetingId, 10);

  // Lance les détecteurs activés en parallèle
  const detectorPromises: Promise<BlindSpotResult | null>[] = [];

  if (detectors.docs) {
    detectorPromises.push(
      detectDocs({
        meetingId: ctx.meetingId,
        boardId: ctx.boardId,
        boardName: ctx.boardName,
        boardSector: ctx.boardSector,
        boardStrategicContext: ctx.boardStrategicContext,
        recentTranscript: ctx.recentTranscript,
        previousEmissions,
        triggerQuery: ctx.triggerQuery,
        isManual,
        triggeredByUserId: ctx.triggeredByUserId,
      }).catch((err) => {
        liveLogger.error("blind-spots detector-docs failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      })
    );
  }

  if (detectors.external) {
    detectorPromises.push(
      detectExternal({
        meetingId: ctx.meetingId,
        boardId: ctx.boardId,
        boardName: ctx.boardName,
        boardSector: ctx.boardSector,
        recentTranscript: ctx.recentTranscript,
        previousEmissions,
        triggerQuery: ctx.triggerQuery,
        isManual,
        triggeredByUserId: ctx.triggeredByUserId,
      }).catch((err) => {
        liveLogger.error("blind-spots detector-external failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      })
    );
  }

  if (detectors.memory) {
    detectorPromises.push(
      detectMemory({
        meetingId: ctx.meetingId,
        boardId: ctx.boardId,
        boardName: ctx.boardName,
        boardSector: ctx.boardSector,
        boardStrategicContext: ctx.boardStrategicContext,
        recentTranscript: ctx.recentTranscript,
        previousEmissions,
        triggerQuery: ctx.triggerQuery,
        isManual,
        triggeredByUserId: ctx.triggeredByUserId,
      }).catch((err) => {
        liveLogger.error("blind-spots detector-memory failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      })
    );
  }

  const settled = await Promise.allSettled(detectorPromises);

  const candidates: BlindSpotResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) candidates.push(r.value);
  }

  // Filtrage final : dedup + quota par domaine
  const accepted: BlindSpotResult[] = [];
  for (const candidate of candidates) {
    // Skip si quota global atteint en cours de filtrage (cas rare avec plusieurs détecteurs)
    if (!isManual && !canEmit(ctx.meetingId, candidate.severity)) continue;

    // Skip si quota domaine atteint
    if (!isManual && !canEmitForDomain(ctx.meetingId, candidate.domain)) continue;

    // Skip si doublon sémantique
    if (isDuplicate(ctx.meetingId, candidate)) continue;

    accepted.push(candidate);

    // Enregistrer l'émission immédiatement pour que les itérations suivantes
    // dans cette même run la considèrent comme déjà émise (anti-cluster)
    recordEmission(ctx.meetingId, candidate);
  }

  return accepted;
}
