import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { liveLogger } from "../utils/logger";
import {
  normalizeRecallTranscript,
  RecallTranscriptWebhookPayload,
  RecallStatusWebhookPayload,
} from "./recall-transcript-adapter";
import { mapRecallStatus } from "./recall-client";
import { processVisioTranscript } from "../orchestrator";

type WebhookEvent =
  | { type: "transcript"; payload: RecallTranscriptWebhookPayload }
  | { type: "status_change"; payload: RecallStatusWebhookPayload };

/**
 * Routes incoming Recall.ai webhooks to the appropriate handler.
 * - transcript events → normalize → inject into pipelines
 * - status_change events → update meeting recall_bot_status
 */
export async function routeWebhook(event: WebhookEvent): Promise<void> {
  if (event.type === "transcript") {
    await handleTranscript(event.payload);
  } else if (event.type === "status_change") {
    await handleStatusChange(event.payload);
  }
}

async function handleTranscript(payload: RecallTranscriptWebhookPayload): Promise<void> {
  const botId = payload.data.bot.id;

  // Normalize Recall transcript to our internal format
  const segment = normalizeRecallTranscript(payload);
  if (!segment) return; // empty — skip

  // Lookup meeting_id from bot_id
  const meetingId = await lookupMeetingByBotId(botId);
  if (!meetingId) {
    liveLogger.warn("Received transcript for unknown bot", { botId });
    return;
  }

  liveLogger.info("Processing visio transcript", { meetingId, speaker: segment.speaker, content: segment.content.slice(0, 50) });

  // Inject into the live session pipelines (same as Deepgram onFinalTranscript)
  await processVisioTranscript(meetingId, segment);
}

async function handleStatusChange(payload: RecallStatusWebhookPayload): Promise<void> {
  const botId = payload.data.bot.id;
  const recallStatus = payload.data.status.code;
  const mappedStatus = mapRecallStatus(recallStatus);

  liveLogger.info("Recall bot status change", { botId, recallStatus, mappedStatus });

  // Update recall_bot_status in DB
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("meetings")
    .update({ recall_bot_status: mappedStatus })
    .eq("recall_bot_id", botId);
}

async function lookupMeetingByBotId(botId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("meetings")
    .select("id")
    .eq("recall_bot_id", botId)
    .single();

  return data?.id ?? null;
}
