import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchAgendaText } from "@/lib/live/utils/fetch-agenda-text";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;

interface GenerationResult {
  reportId: string;
  markdown: string;
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Generates a markdown meeting report ("compte rendu") from the live meeting
 * artifacts (transcription, agenda, decisions, expert insights) and persists
 * it to `meeting_reports`. Idempotent: a previous report for the same meeting
 * is replaced.
 *
 * Runs with the service-role client so it can read across RLS boundaries and
 * be invoked from background contexts (e.g. right after stop-visio).
 */
export async function generateMeetingReport(meetingId: string): Promise<GenerationResult> {
  const supabase = createSupabaseServiceClient();

  // 1. Meeting metadata
  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .select("id, board_id, title, started_at, ended_at, scheduled_at, meeting_type, agenda")
    .eq("id", meetingId)
    .single();
  if (meetingErr || !meeting) throw new Error(`Meeting not found: ${meetingId}`);
  if (!meeting.board_id) throw new Error("Meeting has no board — cannot generate report");

  // Mark as generating immediately so the UI shows a spinner rather than nothing.
  // Uses upsert so re-runs on the same meeting don't create duplicates.
  await supabase.from("meeting_reports").upsert(
    { meeting_id: meetingId, board_id: meeting.board_id, content: "", status: "generating" },
    { onConflict: "meeting_id" }
  );

  try {

  // 2. Board info
  const { data: board } = await supabase
    .from("boards")
    .select("id, name, sector, strategic_context")
    .eq("id", meeting.board_id)
    .single();

  // 3. Participants (FK chain auth.users requires 2-step join, see CLAUDE.md)
  const { data: rawParticipants } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", meetingId);
  const userIds = (rawParticipants ?? []).map((p) => p.user_id).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const participants = (rawParticipants ?? []).map((p) => ({
    name: profileById.get(p.user_id)?.full_name ?? profileById.get(p.user_id)?.email ?? "Participant",
    role: p.role,
  }));

  // 4. Transcription (ordered)
  const { data: transcriptions } = await supabase
    .from("meeting_transcriptions")
    .select("speaker, content, timestamp_start")
    .eq("meeting_id", meetingId)
    .order("timestamp_start", { ascending: true });

  // 5. Agenda — fetch from uploaded agenda document (category='agenda')
  const agendaDocText = await fetchAgendaText(meetingId).catch(() => "");

  // 6. Expert insights (panel)
  const { data: insights } = await supabase
    .from("meeting_expert_insights")
    .select("expert_name, take, analysis, tags, is_manual, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  // Format inputs for the prompt
  const transcriptText = (transcriptions ?? [])
    .map((t) => `[${t.speaker ?? "Inconnu"}] ${t.content}`)
    .join("\n");

  const agendaText = agendaDocText.trim() || "(aucun ordre du jour déposé)";

  const insightsText = (insights ?? [])
    .map((i) => `- ${i.expert_name} : "${i.take}" (${i.analysis})`)
    .join("\n") || "(aucune intervention du panel)";

  const participantsText = participants.length
    ? participants.map((p) => `- ${p.name} (${p.role})`).join("\n")
    : "(participants non renseignés)";

  const dateStr = meeting.started_at
    ? new Date(meeting.started_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
    : meeting.scheduled_at
    ? new Date(meeting.scheduled_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
    : "(date inconnue)";

  const durationStr = meeting.started_at && meeting.ended_at
    ? formatDuration(new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime())
    : "(durée inconnue)";

  const prompt = `Tu es un secrétaire de conseil d'administration expérimenté. Tu produis un compte rendu (procès-verbal) en markdown français à partir des éléments capturés en réunion.

CONTEXTE
Entreprise : ${board?.name ?? "(inconnu)"}
${board?.sector ? `Secteur : ${board.sector}` : ""}
${board?.strategic_context ? `Contexte stratégique : ${board.strategic_context}` : ""}

RÉUNION
Titre : ${meeting.title}
Date : ${dateStr}
Durée : ${durationStr}
Type : ${meeting.meeting_type === "visio" ? "Visioconférence" : "Présentiel"}

PARTICIPANTS
${participantsText}

ORDRE DU JOUR
${agendaText}

TRANSCRIPTION COMPLÈTE (segments parlés)
${transcriptText || "(aucune transcription)"}

INTERVENTIONS DU PANEL D'EXPERTS IA
${insightsText}

INSTRUCTION
Produis un compte rendu markdown complet et professionnel avec EXACTEMENT cette structure :

# Compte rendu — [titre de la réunion]

## En-tête
- **Entreprise** : ...
- **Date** : ...
- **Durée** : ...
- **Type** : Visioconférence / Présentiel
- **Participants** : liste avec rôle

## Ordre du jour
Liste numérotée fidèle à l'ordre du jour fourni (ou reconstitué depuis la transcription si vide).

## Synthèse des discussions
Pour chaque point d'agenda, 1 paragraphe (3-6 phrases) qui résume FIDÈLEMENT ce qui a été dit. Cite les positions divergentes si applicable. Reste neutre — tu rapportes, tu n'analyses pas.

## Décisions
Liste à puces des décisions prises pendant la réunion (en t'appuyant sur la transcription + les décisions détectées). Une décision = ce qui a été tranché, pas une simple discussion. Indique le porteur si mentionné.

## Actions et engagements
Tableau markdown : | Action | Responsable | Échéance | Si pas d'info, mets "—".

## Annexe — Interventions notables du panel d'experts
Liste à puces des prises de position de l'expert IA jugées pertinentes au regard de la discussion (omet les interventions hors-sujet ou redondantes). Format : **[Nom de l'expert]** : "take" — analyse en 1-2 phrases.

RÈGLES
- Français professionnel, ton de PV de conseil — précis, factuel, sans pathos.
- Ne jamais inventer de chiffre, nom ou date qui n'apparaît pas dans les inputs.
- Si une section n'a pas de contenu disponible, écris une phrase explicite type "Aucune décision formelle n'a été actée durant cette séance." plutôt que de l'omettre.
- Pas de markdown imbriqué exotique, pas de HTML.
- Réponds UNIQUEMENT par le markdown du compte rendu, sans préambule ni commentaire.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const markdown = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

    if (!markdown) throw new Error("LLM returned empty report");

    // Update the pre-created row with the final content
    const { data: updated, error: updateErr } = await supabase
      .from("meeting_reports")
      .update({ content: markdown, status: "generated" })
      .eq("meeting_id", meetingId)
      .select("id")
      .single();

    if (updateErr || !updated) throw new Error(`Failed to persist report: ${updateErr?.message ?? "unknown"}`);

    return { reportId: updated.id, markdown };
  } catch (err) {
    console.error("[generate-report] Generation failed for meeting", meetingId, err instanceof Error ? err.message : err);
    await supabase
      .from("meeting_reports")
      .update({ status: "error" })
      .eq("meeting_id", meetingId);
    throw err;
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}
