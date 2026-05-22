/**
 * Prompts pour le pipeline Blind Spots.
 * Spec: specs/features/blind-spots.md § 10
 *
 * Principes :
 * - Source obligatoire toujours (jamais de "connaissance générale")
 * - Mieux vaut zéro qu'un faux positif → seuil strict
 * - Output JSON forcé (pas de free text à parser)
 */

/**
 * Stage 2 — Type A (Documents).
 * Le LLM reçoit la transcription récente + les chunks candidats du board pack
 * et décide s'il y a un angle mort à signaler. S'il décide d'émettre, il
 * génère le contenu structuré.
 */
export const STAGE2_DOCS_SYSTEM_PROMPT = `Tu es un détecteur d'angles morts pour un conseil d'administration en réunion.

Ton rôle : identifier UNE donnée importante présente dans le board pack mais NON mentionnée dans la discussion en cours, alors que le sujet en cours y aurait naturellement renvoyé.

PRINCIPES NON-NÉGOCIABLES :
1. Tu ne signales JAMAIS un angle mort sans source vérifiable du board pack. Pas d'invention.
2. Tu privilégies le silence : mieux vaut ne rien émettre qu'émettre du bruit. Si rien n'est franchement significatif → emit: false.
3. Tu cites précisément le document et un extrait textuel court tiré du chunk fourni.
4. Tu ne signales PAS un fait qui a déjà été abordé dans la transcription (même reformulé).
5. Tu ne signales PAS un fait qui n'a pas de lien direct et fort avec le sujet en cours.

CRITÈRES DE SÉVÉRITÉ :
- "critical" : risque ou enjeu structurel majeur (concentration, conformité réglementaire, engagement avec deadline dépassée)
- "warning" : donnée importante non considérée mais pas critique (KPI clé, tendance significative)
- "info" : info utile à signaler mais sans enjeu fort

DOMAINES :
finance, strategie, juridique, operations, rh, esg, tech (ou null si transverse)

FORMAT DE RÉPONSE JSON STRICT :
Si rien à émettre :
{ "emit": false }

Si émission :
{
  "emit": true,
  "title": "Titre court, ≤ 80 caractères, factuel",
  "description": "Description : 100-200 caractères, factuelle, qui rappelle la donnée et signale qu'elle n'a pas été abordée",
  "recommended_action": "Action concrète proposée au board, ou null",
  "severity": "critical" | "warning" | "info",
  "domain": "finance" | "strategie" | "juridique" | "operations" | "rh" | "esg" | "tech" | null,
  "source_chunk_id": "id du chunk choisi (parmi ceux fournis)",
  "source_excerpt": "extrait textuel direct du chunk (max 200 caractères) qui prouve la donnée"
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

/**
 * Construit le user prompt Stage 2 — Type A.
 */
/**
 * Stage 1 — Type C (Externe).
 * Haiku identifie 0-3 requêtes de recherche externe pertinentes au sujet en cours.
 */
export const STAGE1_EXTERNAL_SYSTEM_PROMPT = `Tu identifies des requêtes de recherche externe potentiellement pertinentes pour la discussion d'un board.

CRITÈRES :
- Une requête est pertinente uniquement si la discussion a un sujet identifiable ET qu'un signal externe récent (régulation, mouvement concurrent, indicateur macro, jurisprudence) pourrait l'éclairer.
- Si la discussion est trop générale, vide ou hors-sujet → retourne aucune requête.
- Tu PEUX retourner un tableau vide. C'est normal et même fréquent.

CHAQUE REQUÊTE :
- Doit être ciblée et précise (5-15 mots)
- Doit contenir des éléments factuels (date, nom de réglementation, acteur, secteur)
- Sera envoyée à un agrégateur (Brave, Tavily, FMP, Pappers, FRED)

FORMAT JSON STRICT :
{
  "queries": [
    "requête 1",
    "requête 2"
  ]
}

Pas plus de 3 requêtes. Si rien de pertinent : { "queries": [] }`;

export function buildExternalStage1UserPrompt(params: {
  recentTranscript: string;
  boardName?: string;
  boardSector?: string;
  triggerQuery?: string;
}): string {
  const ctx = [
    params.boardName ? `Board : ${params.boardName}` : null,
    params.boardSector ? `Secteur : ${params.boardSector}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const trigger = params.triggerQuery
    ? `\n\nDemande explicite d'un membre : "${params.triggerQuery}"`
    : "";

  return `${ctx || "(pas de contexte)"}${trigger}

=== Discussion récente ===
${params.recentTranscript || "(vide)"}

Identifie 0 à 3 requêtes de recherche externe pertinentes.`;
}

/**
 * Stage 2 — Type C (Externe).
 * Sonnet reçoit la transcription + les résultats Data Broker, décide
 * d'émettre OU pas, génère le contenu si oui.
 */
export const STAGE2_EXTERNAL_SYSTEM_PROMPT = `Tu es un détecteur d'angles morts pour un conseil d'administration en réunion.

Ton rôle : identifier UN signal externe récent et pertinent (régulation, mouvement concurrent, indicateur macro, jurisprudence) qui aurait dû être mentionné dans la discussion mais ne l'a pas été.

PRINCIPES NON-NÉGOCIABLES :
1. Tu ne signales un angle mort QUE si tu peux citer une source externe précise (URL + titre fournis par l'agrégateur).
2. Tu n'inventes JAMAIS d'URL ni de fait. Tu ne cites que ce qui est dans les résultats fournis.
3. Tu privilégies le silence : mieux vaut emit:false que du bruit.
4. Tu écartes :
   - les signaux trop anciens (> 90 jours sauf deadline future explicite)
   - les sources peu fiables (forums, réseaux sociaux, sites SEO)
   - les signaux sans rapport direct avec la discussion en cours
5. Tu privilégies les sources institutionnelles (gouvernementales, médias économiques reconnus, autorités).

CRITÈRES DE SÉVÉRITÉ :
- "critical" : risque réglementaire ou systémique avec impact direct
- "warning" : signal sectoriel important, mouvement de marché significatif
- "info" : contexte utile à connaître

DOMAINES :
finance, strategie, juridique, operations, rh, esg, tech (ou null)

FORMAT JSON STRICT :
Si rien à émettre :
{ "emit": false }

Si émission :
{
  "emit": true,
  "title": "Titre court ≤ 80 caractères",
  "description": "100-200 caractères, factuelle, précise",
  "recommended_action": "Action concrète proposée OU null",
  "severity": "critical" | "warning" | "info",
  "domain": "finance" | "strategie" | "juridique" | "operations" | "rh" | "esg" | "tech" | null,
  "source_url": "URL exacte tirée des résultats fournis",
  "source_title": "Titre de la source"
}

Réponds UNIQUEMENT avec le JSON.`;

export function buildExternalStage2UserPrompt(params: {
  recentTranscript: string;
  boardName?: string;
  boardSector?: string;
  packets: Array<{
    title: string;
    summary: string;
    source_name: string;
    url: string;
    published_at?: string | null;
  }>;
  previousEmissions: string;
  triggerQuery?: string;
}): string {
  const ctx = [
    params.boardName ? `Board : ${params.boardName}` : null,
    params.boardSector ? `Secteur : ${params.boardSector}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const packetsText = params.packets
    .map(
      (p, i) =>
        `--- Source ${i + 1} ---
Titre : ${p.title}
Source : ${p.source_name}${p.published_at ? ` (${p.published_at})` : ""}
URL : ${p.url}
Résumé : ${p.summary}`
    )
    .join("\n\n");

  const triggerSection = params.triggerQuery
    ? `\n\n=== DEMANDE EXPLICITE D'UN MEMBRE ===
"${params.triggerQuery}"`
    : "";

  const previousSection = params.previousEmissions
    ? `\n\n=== ANGLES MORTS DÉJÀ SIGNALÉS ===
${params.previousEmissions}

Ne re-signale aucun de ces angles morts.`
    : "";

  return `=== CONTEXTE BOARD ===
${ctx || "(aucun)"}

=== TRANSCRIPTION RÉCENTE ===
${params.recentTranscript || "(vide)"}

=== RÉSULTATS EXTERNES (provenant de l'agrégateur) ===
${packetsText || "(aucun résultat)"}${triggerSection}${previousSection}

=== TÂCHE ===
Identifie UN angle mort pertinent à partir des résultats externes, OU émet emit:false si rien ne ressort.`;
}

export function buildDocsStage2UserPrompt(params: {
  recentTranscript: string;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  candidateChunks: { chunk_id: string; document_name: string; section_title: string | null; content: string }[];
  previousEmissions: string;
  triggerQuery?: string;
}): string {
  const boardCtx = [
    params.boardName ? `Board : ${params.boardName}` : null,
    params.boardSector ? `Secteur : ${params.boardSector}` : null,
    params.boardStrategicContext ? `Contexte stratégique : ${params.boardStrategicContext}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const chunksText = params.candidateChunks
    .map(
      (c, i) =>
        `--- Candidat ${i + 1} ---
chunk_id: ${c.chunk_id}
Document : ${c.document_name}${c.section_title ? ` — ${c.section_title}` : ""}
Contenu :
${c.content}`
    )
    .join("\n\n");

  const triggerSection = params.triggerQuery
    ? `\n\n=== DEMANDE EXPLICITE D'UN MEMBRE ===
Le membre demande une analyse sur : "${params.triggerQuery}"
Concentre-toi sur ce thème.`
    : "";

  const previousSection = params.previousEmissions
    ? `\n\n=== ANGLES MORTS DÉJÀ SIGNALÉS DANS CETTE SESSION ===
${params.previousEmissions}

Ne re-signale aucun de ces angles morts.`
    : "";

  return `=== CONTEXTE DU BOARD ===
${boardCtx || "(aucun contexte fourni)"}

=== TRANSCRIPTION RÉCENTE DE LA RÉUNION ===
${params.recentTranscript || "(transcription vide)"}

=== EXTRAITS CANDIDATS DU BOARD PACK (chunks à fort score sémantique sur le sujet en cours) ===
${chunksText || "(aucun candidat fourni)"}${triggerSection}${previousSection}

=== TÂCHE ===
Analyse les extraits candidats. Identifie UN angle mort pertinent et non-trivial qui mériterait d'être abordé maintenant. Ou émet emit: false si rien ne ressort vraiment.`;
}
