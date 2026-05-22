import { NextRequest, NextResponse } from "next/server";
import { routeWebhook } from "@/lib/live/recall/webhook-router";
import {
  RecallTranscriptWebhookPayload,
  RecallStatusWebhookPayload,
} from "@/lib/live/recall/recall-transcript-adapter";

/**
 * POST /api/live/webhook — Recall.ai webhook endpoint
 * Receives real-time transcription and bot status updates.
 * No auth required (called by Recall.ai servers).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Use the "event" field to determine type
    const eventType = body?.event as string | undefined;

    if (eventType === "transcript.partial_data") {
      // Ignore partial transcripts (building up words)
      return NextResponse.json({ received: true, handled: false });
    } else if (eventType === "transcript.data") {
      console.log("[webhook] Transcript from", body?.data?.data?.participant?.name, ":", body?.data?.data?.words?.map((w: { text: string }) => w.text).join(" "));
      await routeWebhook({
        type: "transcript",
        payload: body as RecallTranscriptWebhookPayload,
      });
    } else if (eventType === "bot.status_change") {
      console.log("[webhook] Bot status change:", body?.data?.status?.code);
      await routeWebhook({
        type: "status_change",
        payload: body as RecallStatusWebhookPayload,
      });
    } else {
      console.log("[webhook] Unknown event:", eventType);
      return NextResponse.json({ received: true, handled: false });
    }

    return NextResponse.json({ received: true, handled: true });
  } catch (error) {
    console.error("[POST /api/live/webhook] Error:", error);
    // Always return 200 to prevent Recall.ai from retrying
    return NextResponse.json({ received: true, error: String(error) });
  }
}
