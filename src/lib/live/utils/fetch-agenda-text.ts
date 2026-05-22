import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { liveLogger } from "./logger";

const MAX_AGENDA_CHARS = 3000;

/**
 * Fetches the text content of the agenda document(s) for a meeting.
 * Looks for documents with category = 'agenda' linked to the meeting,
 * then retrieves their chunks ordered by chunk_index.
 * Returns "" if no agenda document is found.
 */
export async function fetchAgendaText(meetingId: string): Promise<string> {
  try {
    const svc = createSupabaseServiceClient();

    // Find agenda documents for this meeting
    const { data: agendaDocs } = await svc
      .from("documents")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("category", "agenda")
      .eq("status", "indexed");

    if (!agendaDocs || agendaDocs.length === 0) return "";

    const docIds = agendaDocs.map((d) => d.id);

    // Get chunks ordered by position
    const { data: chunks } = await svc
      .from("document_chunks")
      .select("content, chunk_index")
      .in("document_id", docIds)
      .order("chunk_index", { ascending: true });

    if (!chunks || chunks.length === 0) return "";

    const text = chunks
      .map((c) => c.content)
      .join("\n")
      .slice(0, MAX_AGENDA_CHARS);

    liveLogger.info("Agenda text fetched from documents", {
      meeting_id: meetingId,
      doc_count: docIds.length,
      chunk_count: chunks.length,
      chars: text.length,
    });

    return text;
  } catch (err) {
    liveLogger.warn("fetchAgendaText failed", { meeting_id: meetingId, error: String(err) });
    return "";
  }
}
