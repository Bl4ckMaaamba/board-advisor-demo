import { liveLogger } from "../utils/logger";

const RECALL_API_BASE = process.env.RECALL_API_BASE || "https://eu-central-1.recall.ai/api/v1";

interface CreateBotResponse {
  id: string;
  status_changes: { code: string; created_at: string }[];
  meeting_url: string;
}

interface BotStatusResponse {
  id: string;
  status_changes: { code: string; created_at: string }[];
  meeting_url: string;
  recording?: {
    id: string;
    media_shortcuts: { url: string; type: string }[];
  } | null;
}

function getApiKey(): string {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("RECALL_API_KEY is not set");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Token ${getApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function createBot(
  meetingUrl: string,
  botName: string,
  webhookUrl: string
): Promise<{ botId: string }> {
  liveLogger.info("Creating Recall.ai bot", { meetingUrl, botName });

  const res = await fetch(`${RECALL_API_BASE}/bot`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botName,
      recording_config: {
        transcript: {
          provider: { deepgram_streaming: { language: "fr", model: "nova-2" } },
        },
        realtime_endpoints: [
          {
            type: "webhook",
            url: webhookUrl,
            events: ["transcript.data", "transcript.partial_data"],
          },
        ],
      },
      automatic_leave: {
        waiting_room_timeout: 600,
        noone_joined_timeout: 300,
        everyone_left_timeout: { timeout: 120, activate_after: null },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    liveLogger.error("Failed to create Recall bot", { status: res.status, body: text });
    throw new Error(`Recall.ai createBot failed (${res.status}): ${text}`);
  }

  const data: CreateBotResponse = await res.json();
  liveLogger.info("Recall.ai bot created", { botId: data.id });
  return { botId: data.id };
}

export async function stopBot(botId: string): Promise<void> {
  liveLogger.info("Stopping Recall.ai bot", { botId });

  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/leave_call`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    liveLogger.warn("Failed to stop Recall bot", { status: res.status, body: text });
  }
}

export async function getBotStatus(botId: string): Promise<{
  status: string;
  meetingUrl: string;
  recordingUrl: string | null;
}> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recall.ai getBotStatus failed (${res.status}): ${text}`);
  }

  const data: BotStatusResponse = await res.json();
  const latestStatus = data.status_changes.at(-1)?.code ?? "unknown";
  const recordingUrl =
    data.recording?.media_shortcuts?.find((m) => m.type === "video")?.url ?? null;

  return {
    status: latestStatus,
    meetingUrl: data.meeting_url,
    recordingUrl,
  };
}

/** Map Recall.ai status codes to our simplified status */
export function mapRecallStatus(
  recallStatus: string
): "joining" | "in_call" | "recording" | "done" | "error" {
  switch (recallStatus) {
    case "ready":
    case "joining_call":
      return "joining";
    case "in_waiting_room":
    case "in_call_not_recording":
      return "in_call";
    case "in_call_recording":
      return "recording";
    case "call_ended":
    case "done":
      return "done";
    case "fatal":
    case "analysis_failed":
      return "error";
    default:
      return "joining";
  }
}
