import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import PptxGenJS from "pptxgenjs";
import { getAuthenticatedUser, createSupabaseServerClient } from "@/lib/supabase-server";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { AGENT_TOOLS } from "@/lib/agent/tools/definitions";
import { TOOL_EXECUTORS } from "@/lib/agent/tools/registry";
import { addMessage, createConversation, generateTitle, getMessages, updateTitle } from "@/lib/agent/conversation";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { SourceRef } from "@/lib/agent/types";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Read all chunks for given doc IDs directly (no semantic filter) — used by canvas
async function fetchDocumentChunks(documentIds: string[]): Promise<string> {
  if (!documentIds.length) return "";
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("document_chunks")
    .select("content, section_title, chunk_index, documents(name)")
    .in("document_id", documentIds)
    .order("chunk_index", { ascending: true })
    .limit(60);
  if (!data?.length) return "";
  return data
    .map((c: { content: string; section_title?: string; documents?: { name: string }[] | { name: string } | null }) => {
      const docName = (Array.isArray(c.documents) ? c.documents[0]?.name : c.documents?.name) ?? "Document";
      const header = c.section_title ? `[Source : ${docName}] [${c.section_title}]` : `[Source : ${docName}]`;
      return `${header}\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

interface SlideItem {
  layout: "title" | "content" | "section" | "quote" | "two_col";
  title: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  left_label?: string;
  right_label?: string;
  quote?: string;
  speaker?: string;
  notes?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  // Backgrounds
  bg:       "0D1825",  // main slide background
  bgHead:   "142030",  // header band
  bgPanel:  "1A2E44",  // panel / lighter surface
  // Accents
  gold:     "C9A94A",  // primary gold
  goldMid:  "D4B55E",  // mid gold (text)
  goldPale: "E8C878",  // subtitle / secondary text
  // Status
  green:    "3A8C6A",  // positive / available
  greenPale:"4CAF80",  // positive text
  amber:    "B87C2A",  // missing / to-do
  amberPale:"E09840",  // missing text
  red:      "8C3A3A",  // negative
  // Text
  white:    "F4F4F6",
  textSoft: "C0CDD8",  // body text
  textMuted:"7A8E9E",  // captions / muted
  // Separators
  divider:  "1E3348",
};

const SLIDE_W = 13.33; // inches (LAYOUT_WIDE)
const SLIDE_H = 7.5;

// ─── Shape helpers ─────────────────────────────────────────────────────────────
function band(s: PptxGenJS.Slide, y: number, h: number, color: string, x = 0, w = SLIDE_W) {
  s.addShape("rect", { x, y, w, h, fill: { color }, line: { type: "none" } });
}

function slideNumber(s: PptxGenJS.Slide, idx: number) {
  s.addText(String(idx + 1).padStart(2, "0"), {
    x: SLIDE_W - 0.7, y: SLIDE_H - 0.45, w: 0.55, h: 0.35,
    fontSize: 9, color: C.textMuted, fontFace: "Calibri", align: "right",
  });
}

function footer(s: PptxGenJS.Slide, label = "Board Advisor") {
  band(s, SLIDE_H - 0.32, 0.32, C.bgHead);
  s.addText(label, {
    x: 0, y: SLIDE_H - 0.32, w: "100%", h: 0.32,
    fontSize: 8, color: C.textMuted, fontFace: "Calibri", align: "center", valign: "middle",
  });
}

// ─── Slide builders ─────────────────────────────────────────────────────────────

function buildTitleSlide(s: PptxGenJS.Slide, _prs: PptxGenJS, slide: SlideItem) {
  band(s, 0, SLIDE_H, C.bg);

  // Bottom-left decorative panel
  band(s, SLIDE_H - 2.2, 2.2, C.bgPanel, 0, 4.8);
  band(s, SLIDE_H - 2.24, 0.04, C.gold, 0, 4.8);

  // Top accent bar
  band(s, 0, 0.06, C.gold);
  // Left vertical bar
  s.addShape("rect", { x: 0, y: 0, w: 0.06, h: SLIDE_H, fill: { color: C.gold }, line: { type: "none" } });

  // Top-right corner block
  band(s, 0.06, 0.52, C.bgPanel, SLIDE_W - 0.58, 0.52);
  s.addShape("rect", { x: SLIDE_W - 0.58, y: 0.06, w: 0.04, h: 0.52, fill: { color: C.gold }, line: { type: "none" } });

  // Title block — centered
  const titleY = 1.85;
  s.addShape("rect", { x: (SLIDE_W - 5) / 2, y: titleY - 0.07, w: 5, h: 0.04, fill: { color: C.gold }, line: { type: "none" } });
  s.addText(slide.title, {
    x: 0.5, y: titleY, w: SLIDE_W - 1, h: 1.7,
    fontSize: 38, bold: true, color: C.white,
    fontFace: "Calibri", align: "center", valign: "middle",
  });

  if (slide.subtitle) {
    s.addShape("rect", { x: (SLIDE_W - 5) / 2, y: titleY + 1.75, w: 5, h: 0.04, fill: { color: C.gold }, line: { type: "none" } });
    s.addText(slide.subtitle, {
      x: 0.5, y: titleY + 1.84, w: SLIDE_W - 1, h: 0.65,
      fontSize: 15, color: C.goldPale, fontFace: "Calibri", align: "center",
    });
  }

  footer(s);
}

function buildSectionSlide(s: PptxGenJS.Slide, _prs: PptxGenJS, slide: SlideItem, idx: number) {
  band(s, 0, SLIDE_H, C.bg);
  // Left panel
  band(s, 0, SLIDE_H, C.bgPanel, 0, 2.6);
  // Gold strip
  s.addShape("rect", { x: 0, y: 0, w: 0.1, h: SLIDE_H, fill: { color: C.gold }, line: { type: "none" } });
  // Large section number
  s.addText(String(idx).padStart(2, "0"), {
    x: 0.1, y: 1.6, w: 2.45, h: 1.8,
    fontSize: 84, bold: true, color: C.gold, fontFace: "Calibri", align: "center", valign: "middle",
    transparency: 22,
  });
  // Section title
  s.addText(slide.title.toUpperCase(), {
    x: 2.85, y: 2.3, w: SLIDE_W - 3.1, h: 1.1,
    fontSize: 30, bold: true, color: C.white, fontFace: "Calibri", valign: "middle",
  });
  // Gold underline
  s.addShape("rect", { x: 2.85, y: 3.5, w: SLIDE_W - 3.1, h: 0.035, fill: { color: C.gold }, line: { type: "none" } });
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 2.85, y: 3.62, w: SLIDE_W - 3.1, h: 0.5,
      fontSize: 14, color: C.goldPale, fontFace: "Calibri", valign: "top",
    });
  }
  footer(s);
}

function buildContentSlide(s: PptxGenJS.Slide, _prs: PptxGenJS, slide: SlideItem, idx: number) {
  band(s, 0, SLIDE_H, C.bg);

  // Header
  band(s, 0, 1.08, C.bgHead);
  s.addShape("rect", { x: 0, y: 0, w: 0.08, h: SLIDE_H, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape("rect", { x: 0.08, y: 1.08, w: SLIDE_W - 0.08, h: 0.03, fill: { color: C.gold }, line: { type: "none" } });
  s.addText(slide.title, {
    x: 0.24, y: 0.1, w: SLIDE_W - 0.48, h: 0.88,
    fontSize: 21, bold: true, color: C.white, fontFace: "Calibri", valign: "middle",
  });

  // Card-style bullets
  const bullets = (slide.bullets ?? []).slice(0, 5);
  const n = bullets.length;
  if (n > 0) {
    const areaY = 1.2;
    const areaH = SLIDE_H - areaY - 0.42;
    const gap = 0.1;
    const cardH = Math.min((areaH - gap * (n - 1)) / n, 1.18);
    const totalH = cardH * n + gap * (n - 1);
    const startY = areaY + (areaH - totalH) / 2;

    bullets.forEach((b, i) => {
      const cy = startY + i * (cardH + gap);
      const cx = 0.22;
      const cw = SLIDE_W - 0.44;

      // Card background
      s.addShape("rect", { x: cx, y: cy, w: cw, h: cardH, fill: { color: C.bgPanel }, line: { type: "none" } });
      // Gold left accent
      s.addShape("rect", { x: cx, y: cy, w: 0.065, h: cardH, fill: { color: C.gold }, line: { type: "none" } });
      // Number badge
      const bSz = 0.3;
      const bX = cx + 0.13;
      const bY = cy + (cardH - bSz) / 2;
      s.addShape("rect", { x: bX, y: bY, w: bSz, h: bSz, fill: { color: C.bgHead }, line: { type: "none" } });
      s.addText(String(i + 1), { x: bX, y: bY, w: bSz, h: bSz, fontSize: 10, bold: true, color: C.gold, fontFace: "Calibri", align: "center", valign: "middle" });
      // Bullet text
      s.addText(b, { x: cx + 0.55, y: cy + 0.08, w: cw - 0.68, h: cardH - 0.16, fontSize: 14, color: C.textSoft, fontFace: "Calibri", valign: "middle" });
    });
  }

  slideNumber(s, idx);
  footer(s);
}

function buildTwoColSlide(s: PptxGenJS.Slide, _prs: PptxGenJS, slide: SlideItem, idx: number) {
  band(s, 0, SLIDE_H, C.bg);

  // Header
  band(s, 0, 1.08, C.bgHead);
  s.addShape("rect", { x: 0, y: 0, w: 0.08, h: SLIDE_H, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape("rect", { x: 0.08, y: 1.08, w: SLIDE_W - 0.08, h: 0.03, fill: { color: C.gold }, line: { type: "none" } });
  s.addText(slide.title, {
    x: 0.24, y: 0.1, w: SLIDE_W - 0.48, h: 0.88,
    fontSize: 21, bold: true, color: C.white, fontFace: "Calibri", valign: "middle",
  });

  const colY = 1.2;
  const colH = SLIDE_H - colY - 0.42;
  const gutter = 0.2;
  const colW = (SLIDE_W - 0.44 - gutter) / 2;
  const lX = 0.22;
  const rX = lX + colW + gutter;

  const drawCol = (x: number, items: string[], label: string, accent: string, labelTxt: string) => {
    // Full-height column card
    s.addShape("rect", { x, y: colY, w: colW, h: colH, fill: { color: C.bgPanel }, line: { type: "none" } });
    // Top accent strip
    s.addShape("rect", { x, y: colY, w: colW, h: 0.04, fill: { color: accent }, line: { type: "none" } });
    // Column header band
    s.addShape("rect", { x, y: colY + 0.04, w: colW, h: 0.44, fill: { color: accent }, line: { type: "none" } });
    s.addText(label, { x: x + 0.1, y: colY + 0.04, w: colW - 0.2, h: 0.44, fontSize: 11, bold: true, color: labelTxt, fontFace: "Calibri", align: "center", valign: "middle" });

    // Items
    const arr = (items ?? []).slice(0, 6);
    const m = arr.length;
    if (m > 0) {
      const itemAreaY = colY + 0.58;
      const itemAreaH = colH - 0.68;
      const itemGap = 0.06;
      const itemH = Math.min((itemAreaH - itemGap * (m - 1)) / m, 1.0);
      const totalItemH = itemH * m + itemGap * (m - 1);
      const itemStartY = itemAreaY + (itemAreaH - totalItemH) / 2;

      arr.forEach((item, i) => {
        const iy = itemStartY + i * (itemH + itemGap);
        if (i > 0) {
          s.addShape("rect", { x: x + 0.12, y: iy - 0.04, w: colW - 0.24, h: 0.008, fill: { color: C.divider }, line: { type: "none" } });
        }
        s.addShape("rect", { x: x + 0.15, y: iy + itemH / 2 - 0.04, w: 0.07, h: 0.07, fill: { color: accent }, line: { type: "none" } });
        s.addText(item, { x: x + 0.28, y: iy, w: colW - 0.42, h: itemH, fontSize: 13, color: C.textSoft, fontFace: "Calibri", valign: "middle" });
      });
    }
  };

  drawCol(lX, slide.left ?? [], slide.left_label ?? "Points disponibles", C.green, C.greenPale);
  drawCol(rX, slide.right ?? [], slide.right_label ?? "Points manquants", C.amber, C.amberPale);

  slideNumber(s, idx);
  footer(s);
}

function buildQuoteSlide(s: PptxGenJS.Slide, _prs: PptxGenJS, slide: SlideItem, idx: number) {
  band(s, 0, SLIDE_H, C.bg);
  // Decorative left panel
  band(s, 0, SLIDE_H, C.bgPanel, 0, 0.55);
  band(s, 0, SLIDE_H, C.gold, 0, 0.1);

  // Large decorative quotation mark
  s.addText("\u201C", {
    x: 0.6, y: 0.5, w: 2.0, h: 2.0,
    fontSize: 96, bold: true, color: C.gold, fontFace: "Georgia",
    transparency: 45,
  });

  // Quote text
  s.addText(`\u201C${slide.quote ?? ""}\u201D`, {
    x: 0.8, y: 1.6, w: SLIDE_W - 1.5, h: 3.2,
    fontSize: 20, italic: true, color: C.white,
    fontFace: "Georgia", valign: "middle", align: "left",
  });

  // Gold rule above attribution
  if (slide.speaker) {
    band(s, 5.0, 0.025, C.gold, SLIDE_W - 6.5, 5.5);
    s.addText(`\u2014\u2002${slide.speaker}`, {
      x: SLIDE_W - 6.5, y: 5.1, w: 6.0, h: 0.5,
      fontSize: 13, color: C.goldMid, fontFace: "Calibri", align: "right",
    });
  }

  slideNumber(s, idx);
  footer(s);
}

// ─── Main builder ──────────────────────────────────────────────────────────────
function buildPptx(slides: SlideItem[], presentationTitle: string): PptxGenJS {
  const prs = new PptxGenJS();
  prs.layout = "LAYOUT_WIDE";
  prs.author = "Board Advisor";
  prs.subject = presentationTitle;
  prs.title = presentationTitle;

  let sectionIdx = 0;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const s = prs.addSlide();
    s.background = { color: C.bg };

    switch (slide.layout) {
      case "title":   buildTitleSlide(s, prs, slide); break;
      case "section": sectionIdx++; buildSectionSlide(s, prs, slide, sectionIdx); break;
      case "content": buildContentSlide(s, prs, slide, i); break;
      case "two_col": buildTwoColSlide(s, prs, slide, i); break;
      case "quote":   buildQuoteSlide(s, prs, slide, i); break;
    }

    if (slide.notes) s.addNotes(slide.notes);
  }

  return prs;
}

// ─── Slide generation prompt ────────────────────────────────────────────────────
const SLIDE_SYSTEM_PROMPT = `Tu es un expert en communication pour conseils d'administration.
Ta mission : transformer une analyse en une présentation PowerPoint professionnelle de qualité board.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans markdown.
- INTERDIT : emojis, symboles ✅ ❌ ⭐ ★ → □ ●, caractères spéciaux.
- Utilise des mots simples et concis, style "board deck" — pas de phrases longues.
- Max 5 bullets par slide, chaque bullet = 1 ligne courte (max 10 mots).
- Pour les comparaisons ou statuts (disponible vs manquant, forces vs faiblesses) : utilise TOUJOURS "two_col" avec left_label et right_label.

Format JSON strict :
{
  "presentationTitle": "Titre court",
  "summary": "Résumé 2-3 phrases",
  "slides": [
    { "layout": "title", "title": "Titre principal", "subtitle": "Sous-titre ou date" },
    { "layout": "section", "title": "Nom de section" },
    { "layout": "content", "title": "Titre slide", "bullets": ["Point 1", "Point 2"], "notes": "Notes optionnelles" },
    { "layout": "two_col", "title": "Titre", "left_label": "Forces", "right_label": "Risques", "left": ["Item 1", "Item 2"], "right": ["Item A", "Item B"] },
    { "layout": "quote", "quote": "Citation exacte", "speaker": "Auteur, Titre" }
  ]
}

Structure : 6-15 slides, première = title, dernière = recommandations ou conclusion.
Commence toujours par analyser le contenu fourni avant de structurer les slides.`;

// ─── API Route ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { query, conversation_id, board_context, document_ids, prefilled_content }: {
      query: string;
      conversation_id?: string;
      board_context?: BoardContext;
      document_ids?: string[];
      prefilled_content?: string;
    } = body;

    if (!query?.trim()) return NextResponse.json({ error: "Query requise" }, { status: 400 });

    let convId = conversation_id;
    let isNew = false;
    if (!convId) {
      convId = await createConversation(supabase, user.id, board_context?.board_id);
      isNew = true;
    }

    let documentNames: string[] | undefined;
    if (document_ids?.length) {
      const { data: docs } = await supabase.from("documents").select("name").in("id", document_ids);
      if (docs?.length) documentNames = docs.map((d: { name: string }) => d.name);
    }

    const history = await getMessages(supabase, convId, 10);
    const currentMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const startTime = Date.now();
    const toolsUsed: string[] = [];
    const sources: SourceRef[] = [];
    let contextText = prefilled_content ?? "";

    // ── Phase 1: gather context (skip if prefilled_content already provided) ──
    if (!prefilled_content) {
      // Read all chunks for selected documents directly (no semantic threshold — canvas queries are too generic for vector search)
      if (document_ids?.length) {
        try {
          const docContent = await fetchDocumentChunks(document_ids);
          if (docContent) {
            contextText += `## Contenu des documents sélectionnés\n${docContent}\n\n`;
            toolsUsed.push("search_internal_documents");
          }
        } catch {
          // continue without doc context
        }
      }

      // Phase 1b: let model call any other relevant tools (news, financial, legal, etc.)
      const systemPrompt = buildSystemPrompt(board_context, documentNames);
      currentMessages.push({ role: "user", content: query });

      const phase1 = await getClient().messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: AGENT_TOOLS.filter((t) => t.name !== "search_internal_documents"), // already searched above
        messages: currentMessages,
      });

      if (phase1.stop_reason === "tool_use") {
        const toolBlocks = phase1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        const toolResults = await Promise.all(
          toolBlocks.map(async (toolUse) => {
            toolsUsed.push(toolUse.name);
            const executor = TOOL_EXECUTORS[toolUse.name];
            if (!executor) return { type: "tool_result" as const, tool_use_id: toolUse.id, content: "Outil non trouvé", is_error: true };
            try {
              const result = await executor(toolUse.input as Record<string, unknown>, board_context, document_ids, user.id);
              contextText += result + "\n\n";
              return { type: "tool_result" as const, tool_use_id: toolUse.id, content: result };
            } catch (err) {
              return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Erreur: ${err}`, is_error: true };
            }
          })
        );
        currentMessages.push({ role: "assistant", content: phase1.content });
        currentMessages.push({ role: "user", content: toolResults });
      }
      // If no additional tools were called, contextText already has doc content from force-search
    }

    // Phase 2: generate slide JSON
    const slidePrompt = `Demande : "${query}"\n\n${contextText ? `Contenu à mettre en forme :\n${contextText}` : "Génère une présentation de structure basée sur la demande."}`;
    const slideResponse = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SLIDE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: slidePrompt }],
    });

    const rawText = slideResponse.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let slideData: { presentationTitle: string; slides: SlideItem[]; summary: string };
    try {
      slideData = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Structure de présentation invalide.", raw: cleaned }, { status: 500 });
    }

    const title = slideData.presentationTitle ?? "Présentation Board Advisor";

    // Phase 3: build PPTX server-side
    const prs = buildPptx(slideData.slides ?? [], title);
    const pptxBuffer = await prs.write({ outputType: "nodebuffer" }) as Buffer;

    // Save assistant message
    const dbContent = `**Présentation générée :** ${title}\n\n${slideData.summary ?? ""}`;
    addMessage(supabase, convId!, "assistant", dbContent, sources, Array.from(new Set(toolsUsed))).catch(console.error);
    if (isNew) generateTitle(query).then((t2) => updateTitle(supabase, convId!, t2)).catch(console.error);

    const safeTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim() || "presentation";
    const latency = Date.now() - startTime;

    return new NextResponse(pptxBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeTitle}.pptx"`,
        "X-Presentation-Title": encodeURIComponent(title),
        "X-Summary": encodeURIComponent(slideData.summary ?? ""),
        "X-Latency": String(latency),
        "X-Tools-Used": Array.from(new Set(toolsUsed)).join(","),
        "X-Conv-Id": convId!,
        "X-Is-New": String(isNew),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
