import { TranscriptionSegment } from "../schemas";

/**
 * Actual Recall.ai real-time transcription webhook payload.
 * Format: { event: "transcript.data", data: { data: { words, participant, ... }, bot: { id } } }
 */
export interface RecallTranscriptWebhookPayload {
  event: string;
  data: {
    data: {
      words: {
        text: string;
        start_timestamp: { relative: number; absolute: string };
        end_timestamp: { relative: number; absolute: string };
      }[];
      language_code: string;
      participant: {
        id: number;
        name: string;
        is_host: boolean;
        platform: string;
      };
    };
    transcript: { id: string; metadata: Record<string, unknown> };
    bot: { id: string; metadata: Record<string, unknown> };
    recording: { id: string; metadata: Record<string, unknown> };
  };
}

/**
 * Recall.ai bot status change webhook payload.
 * Format: { event: "bot.status_change", data: { ... } }
 */
export interface RecallStatusWebhookPayload {
  event: string;
  data: {
    bot: { id: string };
    status: {
      code: string;
      message: string | null;
      created_at: string;
      sub_code: string | null;
    };
  };
}

/**
 * Normalizes a Recall.ai real-time transcript webhook into our internal TranscriptionSegment format.
 */
export function normalizeRecallTranscript(
  payload: RecallTranscriptWebhookPayload
): TranscriptionSegment | null {
  const { data: transcriptData } = payload.data;

  if (!transcriptData.words || transcriptData.words.length === 0) {
    return null;
  }

  const fullText = transcriptData.words.map((w) => w.text).join(" ");
  const speaker = transcriptData.participant?.name || `Speaker ${transcriptData.participant?.id || 0}`;

  return {
    speaker,
    content: fullText,
    timestamp_start: transcriptData.words[0].start_timestamp.relative,
    timestamp_end: transcriptData.words[transcriptData.words.length - 1].end_timestamp.relative,
    confidence: 0.9, // AssemblyAI streaming doesn't provide per-word confidence in this format
  };
}
