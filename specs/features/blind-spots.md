# Cahier des Charges — Section Angles Morts

> **Projet :** Board Advisor — Module Live
> **Feature :** Section Angles Morts
> **Version :** 1.0
> **Auteur :** Noah Soulisse
> **Statut :** À implémenter

---

## Table des matières

1. [Contexte et périmètre](#1-contexte-et-périmètre)
2. [Vision produit](#2-vision-produit)
3. [Typologie des angles morts](#3-typologie-des-angles-morts)
4. [Modes de déclenchement](#4-modes-de-déclenchement)
5. [Interfaces utilisateur](#5-interfaces-utilisateur)
6. [Architecture technique](#6-architecture-technique)
7. [Modèle de données](#7-modèle-de-données)
8. [Pipelines détaillés](#8-pipelines-détaillés)
9. [Cadence, quota, dedup](#9-cadence-quota-dedup)
10. [Prompts et modèles LLM](#10-prompts-et-modèles-llm)
11. [Risques et points d'attention](#11-risques-et-points-dattention)
12. [Instructions d'implémentation](#12-instructions-dimplémentation)

---

## 1. Contexte et périmètre

### 1.1 Le besoin

Pendant un board meeting, la valeur d'un copilote IA n'est pas seulement de vérifier ce qui est dit (fact-checking) ou de proposer des questions à poser (suggestions), mais aussi — et surtout — de **remonter ce qui n'est pas dit alors que ça mériterait d'être abordé**.

L'analyse de boards réels (notamment le board CXG analysé en mars 2026) a montré que les administrateurs passent à côté de :

- Des données chiffrées présentes dans leur board pack mais jamais mentionnées en séance
- Des décisions ou engagements pris lors des boards précédents qui ne sont plus suivis
- Des signaux externes (régulation, mouvements concurrents, contexte sectoriel) pertinents pour la discussion en cours

La section Angles morts est conçue pour détecter et signaler ces **non-dits importants** en temps réel, pendant la réunion.

### 1.2 Périmètre

| | |
|---|---|
| **Inclus** | Section Angles morts dans le module Live, pour sessions in-person ET visio. Trois types de détection (A, B, C). Deux modes : automatique et manuel. UX pop-up + compartiment historique. |
| **Exclu** | Modification du panel expert (auto → manuel) — feature distincte traitée dans un autre CDC. Mode pré-réunion (les angles morts pré-board sont déjà couverts par le module Préparation). Notifications post-réunion (les angles morts non traités ne génèrent pas de relance après la séance). |

### 1.3 Définition d'un angle mort

Un **angle mort** est une information importante, vérifiable, qui aurait dû être abordée dans le segment de discussion en cours mais qui ne l'a pas été. Il se distingue clairement des autres pipelines :

- ≠ **Fact-check** : ne vérifie pas un fait dit, mais signale un fait *non dit*
- ≠ **Suggestion** : pas une question à poser, mais une **alerte** sur quelque chose d'oublié
- ≠ **Expert** : pas un avis stratégique, mais une remontée de **donnée concrète** ou **risque structurel** ancré dans une source

**Règle absolue : tout angle mort doit citer une source vérifiable.** Pas d'angle mort fondé uniquement sur la "connaissance générale" du modèle. La crédibilité de la feature dépend strictement de l'ancrage des signaux dans des sources citables (document du board, mémoire institutionnelle, source web via Data Broker).

---

## 2. Vision produit

### 2.1 Positionnement dans le produit

La section Angles morts est le **5e pipeline** du module Live, mais d'une nature différente des 4 autres. Là où Fact-check, Modération, Suggestions et Expert réagissent à *ce qui est dit*, le pipeline Angles morts réagit à la **totalité du contexte** : ce qui est dit + ce qui est dans les documents + ce qui est dans la mémoire institutionnelle + ce qui est dans l'environnement externe.

C'est ce qui justifie un rythme de déclenchement et un budget de latence différents (moins fréquent, plus profond).

### 2.2 Principes directeurs

1. **Source obligatoire toujours.** Aucun angle mort n'est émis sans source citable. Pas d'exception.
2. **Mieux vaut zéro qu'un faux positif.** Le seuil de pertinence doit être strict. Saturer le board avec des alertes peu pertinentes tue la feature.
3. **Trois types, une expérience unifiée.** Côté utilisateur, les 3 types A/B/C apparaissent dans le même flux, avec un badge discret indiquant la source. Pas de complexité cognitive ajoutée.
4. **L'utilisateur reste maître.** Pop-up qu'on peut retirer, mode auto désactivable, mode manuel sur question ciblée.
5. **Cohabitation avec les autres pipelines.** Pas de chevauchement avec les suggestions ou le fact-check. Le système doit dédupliquer entre pipelines si nécessaire.

---

## 3. Typologie des angles morts

Trois types coexistent dans la même section. Chaque type a sa propre logique de détection, sa propre source, et son propre niveau de confiance.

### 3.1 Type A — Données du board pack non mentionnées

**Définition :** Une donnée chiffrée, un fait, un risque ou un point structurel présent dans les documents du board mais jamais évoqué dans la discussion en cours alors que le segment de conversation y aurait naturellement renvoyé.

**Exemples concrets :**
- Le board discute du Q4 mais personne ne mentionne le risque de concentration client (60% du CA sur 3 clients) chiffré en page 12 du rapport financier.
- Le board valide une roadmap d'expansion mais personne ne rappelle l'engagement budgétaire CSRD prévu dans l'annexe ESG.

**Détection :**
- Le pipeline accède au RAG des documents du board courant.
- Il identifie le sujet en cours de discussion (via les derniers tours de parole).
- Il recherche dans les documents des chunks à fort score sémantique sur ce sujet qui n'ont pas été reformulés ou cités dans la transcription.
- Si écart significatif entre "ce qui est dans les docs" et "ce qui est dit", il déclenche une analyse Stage 2.

**Confiance :** Très élevée. Source 100% vérifiable, hallucination quasi-impossible. C'est le type qui doit constituer la majorité des émissions.

**Format de sortie :**
- **Titre** : "Risque de concentration client non abordé"
- **Description** : "60% du CA repose sur 3 clients (rapport financier Q4, p.12), aucune mention dans la discussion sur la stratégie commerciale"
- **Source** : `document_id` + `page` + `chunk_id` (cliquable, ouvre le DocumentPreviewModal sur la section concernée)

### 3.2 Type B — Mémoire institutionnelle

**Définition :** Une décision, un engagement ou un point soulevé lors d'un board précédent, pertinent pour la discussion en cours, qui n'est ni rappelé ni traité.

**Exemples concrets :**
- Lors du board N-1, François a insisté sur l'importance du CA/m² comme KPI fondamental. Aujourd'hui, la roadmap retail est présentée sans aucune mention du CA/m².
- Un engagement pris au board N-2 ("livrer un plan de succession DAF avant fin Q2") n'a pas été suivi et n'est pas non plus mentionné aujourd'hui alors que le sujet RH est à l'ordre du jour.

**Détection :**
- Le pipeline accède à l'historique des boards précédents : transcriptions indexées + table des décisions/engagements (si elle existe).
- Il identifie le sujet en cours et recherche dans l'historique :
  - Décisions actives non clôturées sur ce sujet
  - Points soulevés récurrents non traités
  - Engagements avec deadline dépassée
- Si match significatif, il déclenche une analyse Stage 2.

**Confiance :** Élevée. Source vérifiable (transcription ou décision passée), mais nécessite une infra de mémoire institutionnelle qui doit exister en amont.

> **⚠️ Instruction pour Claude Code lors de l'implémentation :**
> *Avant d'implémenter le détecteur Type B, vérifie l'état actuel de l'infrastructure de mémoire institutionnelle dans le repo. Inspecte notamment :*
> - *La structure des tables Supabase (existe-t-il `board_decisions`, `board_history`, ou équivalent ?)*
> - *L'indexation RAG des transcriptions de boards précédents (sont-elles dans la même table que les documents, ou séparées ? avec quelles métadonnées ?)*
> - *Les liens entre `boards`, `meetings`, `meeting_transcripts` et les documents historiques.*
>
> *En fonction de ce que tu trouves, deux scénarios :*
>
> **Scénario 1 — l'infra existe partiellement ou totalement :** plug le détecteur Type B sur ce qui existe. Documente dans un fichier `BLIND_SPOTS_INFRA.md` ce que tu as trouvé et comment tu l'utilises.
>
> **Scénario 2 — rien n'existe pour la mémoire institutionnelle :** crée la migration nécessaire. Au minimum, il faut :
> - Une table `board_decisions` (id, board_id, meeting_id, type [decision/engagement/recurring_point], title, description, status [open/closed/overdue], deadline, created_at)
> - Une indexation RAG des transcriptions de boards précédents avec métadonnées `meeting_id` + `meeting_date` + `board_id`, accessible via une fonction `match_board_history(board_id, query, k)`
> - Un mécanisme d'alimentation : à chaque clôture de meeting, un job extrait les décisions et engagements de la transcription via un prompt LLM dédié, et les insère dans `board_decisions`. Ce job est hors périmètre du présent CDC mais doit être posé comme prérequis dans le `BLIND_SPOTS_INFRA.md`.

**Format de sortie :**
- **Titre** : "Décision du board N-1 non traitée"
- **Description** : "François avait identifié le CA/m² comme KPI prioritaire (board du 15/01/2026). La roadmap retail présentée aujourd'hui ne le mentionne pas."
- **Source** : `meeting_id` du board précédent + extrait de transcription + `decision_id` si applicable (cliquable, ouvre le détail)

### 3.3 Type C — Signaux externes

**Définition :** Un signal externe (régulation à venir, mouvement concurrent, donnée macroéconomique, jurisprudence) pertinent pour le sujet en cours de discussion, non mentionné par les participants.

**Exemples concrets :**
- Le board valide un budget marketing en hausse mais personne ne mentionne l'évolution récente du taux directeur BCE qui impacte le coût d'acquisition.
- Le board discute de l'expansion APAC mais personne ne mentionne la nouvelle réglementation sur les données personnelles entrée en vigueur récemment dans la zone visée.

**Détection :**
- Le pipeline interroge le **Data Broker existant** (Brave Search, Tavily, FMP, Pappers, FRED, PISTE/Légifrance, JUDILIBRE selon le type de signal recherché).
- Il identifie le sujet en cours, formule une requête ciblée vers le Data Broker, et récupère les signaux récents (< 90 jours par défaut, paramétrable).
- Il filtre uniquement les signaux à fort impact pour l'entreprise (secteur, taille, géographie).

**Confiance :** Moyenne à élevée selon la source. Risque d'hallucination si la source web n'est pas correctement ancrée. Le Stage 2 doit citer l'URL exacte et l'extrait pertinent.

**Format de sortie :**
- **Titre** : "Nouvelle réglementation APAC non abordée"
- **Description** : "La Singapour PDPA Amendment Act est entrée en vigueur le X/X/2026. Impact direct sur le projet d'expansion discuté."
- **Source** : URL + nom de la source (cliquable, ouvre l'article dans un nouvel onglet)

### 3.4 Synthèse comparative

| Critère | Type A — Docs | Type B — Mémoire | Type C — Externe |
|---|---|---|---|
| **Source** | RAG documents du board courant | RAG historique boards + table décisions | Data Broker (web, APIs) |
| **Confiance** | Très élevée | Élevée | Moyenne-élevée |
| **Coût API** | Faible (RAG local) | Faible (RAG local) | Plus élevé (appels Data Broker) |
| **Latence** | < 2s | < 2s | 3 à 8s selon provider |
| **Volume attendu** | Le plus émis | Modéré | Le moins émis (filtré strict) |
| **Prérequis** | RAG documents existant (à confirmer) | Infra mémoire institutionnelle (à créer ou plug) | Data Broker déjà setup ✓ |

---

## 4. Modes de déclenchement

### 4.1 Mode automatique

Le pipeline tourne en arrière-plan pendant la réunion, déclenche les détecteurs aux moments opportuns, et émet les angles morts qui dépassent le seuil de pertinence.

**Comportement :**
- Tourne en parallèle des 4 pipelines existants dans `runPipelines()` de l'orchestrateur.
- Cadence et quota définis en section 9.
- Les angles morts apparaissent en pop-up (cf. section 5) et sont stockés dans le compartiment historique.

**Activation/désactivation :**
- Toggle dans les paramètres du board ou de la réunion (`auto_blind_spots: true/false`).
- Désactivable même en cours de réunion (un membre clique sur "désactiver les angles morts auto").
- Si désactivé, seul le mode manuel reste accessible.

### 4.2 Mode manuel — Question ciblée

À tout moment, un membre du board peut solliciter une analyse d'angle mort sur **un thème ou une question précise**.

**Cas d'usage typique :** À la fin d'une discussion sur un sujet (par exemple "stratégie APAC"), un membre clique sur "Analyse d'angle mort" et saisit "Sur la stratégie APAC, qu'est-ce qu'on n'a pas vu ?". Le système prend les derniers tours de parole liés à ce sujet, lance les 3 types de détection en parallèle, et retourne le ou les angles morts les plus pertinents.

**UX du déclenchement :**
- Bouton dans la section Angles morts : "Demander une analyse"
- Au clic, un input texte apparaît : "Sur quel thème ou question voulez-vous une analyse ?"
- L'utilisateur saisit (par exemple) "stratégie APAC" ou "risque réglementaire ESG"
- Le système :
  - Lance les détecteurs A, B, C en parallèle avec ce contexte
  - Affiche un loader "Recherche en cours..."
  - Retourne les angles morts pertinents (peut être 0 si rien de significatif)
- Aucun cooldown ni quota en mode manuel : l'utilisateur a explicitement demandé.
- L'angle mort manuel est marqué `is_manual = true` en base.

**Bypass des seuils :** En mode manuel, le seuil de pertinence Stage 1 est abaissé (par exemple de 8/10 à 6/10) car l'utilisateur a explicitement demandé une analyse.

### 4.3 Décisions ouvertes

- **D-AUTO-1** : le mode auto est-il activé par défaut sur tous les boards, ou désactivé par défaut et activable explicitement ? *Recommandation : activé par défaut, désactivable.*
- **D-MAN-1** : faut-il limiter les déclenchements manuels (ex. max 5/h) pour éviter l'usage abusif ? *Recommandation : pas de limite, faire confiance à l'utilisateur.*

---

## 5. Interfaces utilisateur

### 5.1 Pop-up éphémère

Quand un nouvel angle mort est émis (auto ou manuel), il apparaît sous forme de pop-up dans la zone principale du dashboard live.

**Apparence :**
- Card flottante en haut à droite (ou positionnée selon les autres pop-ups existantes)
- Icône de sévérité (rouge / orange / bleu)
- Titre court (~50 caractères)
- Description courte (~150 caractères)
- Badge type (A / B / C) discret
- Source cliquable
- Bouton "X" (fermer la pop-up)
- Animation d'apparition douce, pas brusque

**Comportement :**
- L'utilisateur peut cliquer sur "X" pour retirer la pop-up de l'écran principal.
- Le retrait de la pop-up est **purement visuel** : l'angle mort reste dans le compartiment historique pour la suite de la réunion.
- Disparition automatique après X secondes (à définir, par défaut 30s) si non interactée.
- Si plusieurs angles morts émis quasi simultanément : les pop-ups s'empilent verticalement, pas de superposition.

### 5.2 Compartiment historique dans le dashboard live

Un compartiment dédié dans le dashboard live recense **tous les angles morts détectés pendant la session**, qu'ils aient été retirés de l'écran principal ou non.

**Position :** À définir avec la maquette globale du dashboard live. Probablement en sidebar droite avec les autres panels existants (Fact-checks, Modération, Suggestions, Expert).

**Apparence :**
- Liste chronologique inverse (le plus récent en haut)
- Chaque entrée :
  - Icône sévérité
  - Titre
  - Description courte
  - Badge type (A / B / C)
  - Timestamp
  - Source cliquable
  - Si Type B avec `decision_id` : badge "Décision board N-X"
- Filtres possibles : par type, par sévérité, par domaine
- Pas de bouton "marquer comme traité" — pas de statut, juste de l'historique passif

**Au clic sur une entrée :**
- Expansion de la carte avec le détail complet (description longue, source détaillée, action recommandée si applicable)
- Au clic sur la source :
  - Si document → ouvre le `DocumentPreviewModal` sur la section concernée
  - Si meeting historique → ouvre la transcription du board précédent au timestamp pertinent
  - Si URL externe → ouvre dans un nouvel onglet

### 5.3 Indicateur d'activité

Dans le compartiment historique, un petit indicateur :
- "🟢 Surveillance active" si mode auto activé
- "⚪ Mode manuel uniquement" si mode auto désactivé

### 5.4 Notifications de sévérité

Pour les angles morts de sévérité `critical`, la pop-up :
- A une bordure rouge plus marquée
- Reste affichée plus longtemps (60s au lieu de 30s)
- Aucun son, aucune notification système — uniquement visuel discret

---

## 6. Architecture technique

### 6.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────┐
│  TRANSCRIPTION (existant)                                │
│  ├─ In-person : Deepgram                                 │
│  └─ Visio : Recall.ai                                    │
└──────────────────────────────────────────────────────────┘
                       ▼
              SpeakerTurnBuffer (existant)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  ORCHESTRATEUR — runPipelines() (existant, à étendre)    │
│  Lance 5 pipelines en parallèle :                        │
└──────────────────────────────────────────────────────────┘
   │           │           │           │            │
   ▼           ▼           ▼           ▼            ▼
Pipeline 1  Pipeline 2  Pipeline 3  Pipeline 4   Pipeline 5
FACT-CHECK  MODÉRATION  SUGGESTIONS EXPERT       BLIND SPOTS
                                                  (NOUVEAU)
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                       Détecteur A         Détecteur B         Détecteur C
                       (Docs RAG)          (Mémoire)           (Data Broker)
                              │                   │                   │
                              └───────────────────┼───────────────────┘
                                                  ▼
                                          Stage 2 — Analyse (Sonnet)
                                                  ▼
                                          Dedup sémantique
                                                  ▼
                                      Écriture meeting_blind_spots
                                                  ▼
                                          Realtime Supabase
                                                  ▼
                                      UI : Pop-up + Compartiment historique
```

### 6.2 Fichiers à créer

```
src/lib/live/pipelines/
└─ blind-spots.ts                  → orchestration du pipeline (entry point)

src/lib/live/blind-spots/
├─ index.ts                         → exports
├─ blind-spots-orchestrator.ts      → coordonne les 3 détecteurs A/B/C
├─ blind-spots-prompts.ts           → tous les system prompts
├─ blind-spots-analyzer.ts          → Stage 2 (Sonnet — analyse commune aux 3 types)
├─ blind-spots-dedup.ts             → dedup sémantique inter-pipelines
├─ blind-spots-types.ts             → types TypeScript partagés
│
├─ detectors/
│  ├─ detector-docs.ts              → Type A : recherche RAG documents
│  ├─ detector-memory.ts            → Type B : recherche RAG historique + decisions
│  └─ detector-external.ts          → Type C : interrogation Data Broker

src/app/dashboard/meetings/live/
├─ components/
│  ├─ BlindSpotsPanel.tsx          → compartiment historique (sidebar)
│  ├─ BlindSpotPopup.tsx           → pop-up flottante
│  └─ BlindSpotManualForm.tsx      → input texte mode manuel
└─ hooks/
   └─ useRealtimeBlindSpots.ts     → hook Supabase Realtime

src/app/api/meetings/[id]/blind-spots/
└─ route.ts                         → endpoint manuel POST + GET historique

supabase/migrations/
└─ 0XX_blind_spots.sql              → table + RLS + Realtime
                                     (numéro à déterminer selon migrations existantes)

specs/features/
└─ blind-spots.md                   → ce CDC (référence)

BLIND_SPOTS_INFRA.md                → généré par Claude Code après inspection
                                     du repo, documente l'état de l'infra
                                     mémoire institutionnelle et RAG
```

### 6.3 Intégration dans l'orchestrateur

Dans `src/lib/live/orchestrator.ts`, fonction `runPipelines()`, ajouter un 5e bloc :

```typescript
// Pipeline 5 : Blind Spots
if (shouldRunBlindSpots(session, lastBlindSpotAt)) {
  pipelinePromises.push(
    runWithTimeout(
      runBlindSpotsPipeline({
        session,
        recentTurns,
        boardContext,
      }),
      BLIND_SPOTS_TIMEOUT_MS, // 12s (plus long que les autres car peut appeler Data Broker)
      "blind-spots"
    )
  );
}
```

La fonction `shouldRunBlindSpots` applique la cadence définie en section 9.

---

## 7. Modèle de données

### 7.1 Migration SQL

```sql
-- supabase/migrations/0XX_blind_spots.sql

CREATE TABLE meeting_blind_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

  -- Contenu
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommended_action TEXT,

  -- Classification
  type TEXT NOT NULL CHECK (type IN ('docs', 'memory', 'external')),
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info')),
  domain TEXT, -- finance, strategie, juridique, operations, rh, esg, tech

  -- Source (polymorphe selon type)
  source_type TEXT NOT NULL, -- 'document' | 'meeting_history' | 'decision' | 'web' | 'api'
  source_reference JSONB NOT NULL, -- structure variable selon source_type

  -- Métadonnées de génération
  is_manual BOOLEAN DEFAULT false,
  triggered_by_user_id UUID REFERENCES auth.users(id),
  trigger_query TEXT,
  relevance_score NUMERIC,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_blind_spots_meeting ON meeting_blind_spots(meeting_id, created_at DESC);
CREATE INDEX idx_blind_spots_type ON meeting_blind_spots(meeting_id, type);
CREATE INDEX idx_blind_spots_severity ON meeting_blind_spots(meeting_id, severity);

-- RLS
ALTER TABLE meeting_blind_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blind_spots_select_for_board_members"
  ON meeting_blind_spots FOR SELECT
  USING (
    meeting_id IN (
      SELECT m.id FROM meetings m
      JOIN board_members bm ON bm.board_id = m.board_id
      WHERE bm.user_id = auth.uid()
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_blind_spots;
```

> **⚠️ Instruction pour Claude Code :**
> *Avant de poser cette migration, vérifie le pattern utilisé dans les migrations existantes (notamment `meeting_expert_insights` et `meeting_factchecks`). Aligne le nommage des colonnes, le style de RLS, le format des indices, etc. sur ce qui existe déjà.*

### 7.2 Types TypeScript

```typescript
// src/lib/live/blind-spots/blind-spots-types.ts

export type BlindSpotType = 'docs' | 'memory' | 'external';
export type BlindSpotSeverity = 'critical' | 'warning' | 'info';
export type BlindSpotDomain =
  | 'finance' | 'strategie' | 'juridique'
  | 'operations' | 'rh' | 'esg' | 'tech';

export interface BlindSpotSourceDocs {
  document_id: string;
  page?: number;
  chunk_id: string;
  excerpt: string;
}

export interface BlindSpotSourceMemory {
  meeting_id: string;
  meeting_date: string;
  timestamp_ms?: number;
  transcript_excerpt: string;
  decision_id?: string;
}

export interface BlindSpotSourceExternal {
  url: string;
  title: string;
  published_at?: string;
  provider: 'brave' | 'tavily' | 'fmp' | 'pappers' | 'fred' | 'piste' | 'judilibre';
}

export interface BlindSpot {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  recommended_action?: string;
  type: BlindSpotType;
  severity: BlindSpotSeverity;
  domain?: BlindSpotDomain;
  source_type: 'document' | 'meeting_history' | 'decision' | 'web' | 'api';
  source_reference: BlindSpotSourceDocs | BlindSpotSourceMemory | BlindSpotSourceExternal;
  is_manual: boolean;
  triggered_by_user_id?: string;
  trigger_query?: string;
  relevance_score: number;
  created_at: string;
}
```

---

## 8. Pipelines détaillés

### 8.1 Pattern commun

Tous les détecteurs suivent un pattern à 2 stages :

- **Stage 1 — Détection (Haiku, ~200-500ms)** : score 0-10, candidats si ≥ seuil.
- **Stage 2 — Analyse (Sonnet, ~2-3s)** : génère titre, description, action recommandée, source.

### 8.2 Détecteur A — Documents du board pack

**Stage 1 :**
- Embedder la fenêtre de transcription récente
- `match_documents` avec k=20
- Filtrer chunks à fort score (>0.75) non cités dans la transcription
- Score Stage 1 = score sémantique meilleur chunk × 10

**Stage 2 :**
- Prompt Sonnet : transcription + chunks candidats + demande angle mort
- Output JSON structuré

### 8.3 Détecteur B — Mémoire institutionnelle

**Stage 1 :**
- Recherche parallèle : sémantique sur transcriptions historiques + filtrage `board_decisions` ouvertes/dépassées

**Stage 2 :**
- Prompt Sonnet : transcription + éléments d'historique + génération angle mort

### 8.4 Détecteur C — Signaux externes

**Stage 1 :**
- Haiku propose 0-3 requêtes ciblées
- Si 0 → arrêt
- Sinon → appel Data Broker en parallèle

**Stage 2 :**
- Prompt Sonnet : transcription + résultats Data Broker + filtrage strict

**Filtres :**
- Exclure > 90 jours (sauf deadlines futures)
- Exclure forums / réseaux sociaux / SEO
- Privilégier sources institutionnelles

---

## 9. Cadence, quota, dedup

### 9.1 Cadence

- **Tick global :** 60 secondes
- **Type A (docs)** : à chaque tick
- **Type B (mémoire)** : tous les 2 ticks ou changement de sujet
- **Type C (externe)** : tous les 5 ticks ou changement de sujet

### 9.2 Quota

- Max **5 angles morts/heure** tous types confondus
- Max **1/fenêtre 5 min** sauf `critical`
- Max **2/domaine/heure**

### 9.3 Dedup sémantique

- Embedding `title + description`
- Cosine similarity ≥ **0.85** → doublon → rejet
- Dedup inter-pipelines (vs Suggestions notamment)

---

## 10. Prompts et modèles LLM

| Stage | Modèle |
|---|---|
| Stage 1 | Claude Haiku |
| Stage 2 | Claude Sonnet |
| Détection changement de sujet | Claude Haiku |

Sortie structurée JSON via `tool_use` :
```typescript
{
  emit: boolean,
  title?: string,
  description?: string,
  recommended_action?: string,
  severity?: 'critical' | 'warning' | 'info',
  domain?: string,
  source: { /* selon détecteur */ }
}
```

Prompts centralisés dans `blind-spots-prompts.ts`, en français.

---

## 11. Risques et points d'attention

### 11.1 Risques techniques
- Saturation cognitive utilisateur (mitigation : quota + pop-up éphémère)
- Coût API +25-40% par session
- Latence Type C (3-8s, timeout 12s)
- Hallucination de sources (Type C : URL doit exister dans résultats Data Broker)

### 11.2 Risques produit
- Confusion avec Suggestions (dedup obligatoire)
- Acceptabilité par administrateurs (toggle off important)
- Dépendance forte au RAG documents et historique

### 11.3 Risques sécurité
- Aucun supplémentaire
- RLS standard
- Type C : confidentialité des requêtes Data Broker

---

## 12. Instructions d'implémentation

### 12.1 Fichier de découverte à produire

Avant tout commit, produire `BLIND_SPOTS_INFRA.md` documentant :

1. État du RAG documents (fonction SQL, métadonnées chunks, embeddings, table)
2. État de la mémoire institutionnelle (`board_decisions` ? indexation transcriptions ?)
3. État du Data Broker côté runtime (Brave, Tavily, FMP, Pappers, FRED, PISTE, JUDILIBRE opérationnels ?)
4. Pattern des autres pipelines (structure, nommage, timeouts, dedup, modèles, prompts)
5. Pattern de migration et RLS
6. Pattern UI des panels live

### 12.2 Ordre recommandé d'implémentation

1. Inspection du repo et rédaction de `BLIND_SPOTS_INFRA.md`
2. Migration SQL et types TypeScript
3. Détecteur Type A (le plus simple)
4. Composant UI de base (Panel + Popup + hook Realtime)
5. Intégration dans l'orchestrateur en mode auto
6. Mode manuel + endpoint dédié
7. Détecteur Type C (Data Broker)
8. Détecteur Type B (selon disponibilité infra mémoire)
9. Dedup sémantique inter-pipelines
10. Quota et cadence fine-tuning
11. Polish UX

### 12.3 Tests à prévoir
- Unitaires : cadence, dedup
- Intégration : chaque détecteur avec mocks
- E2E : session live simulée
- Charge : session 2h, 50 turns/h

### 12.4 Logs et observabilité
À chaque tick : détecteurs lancés, scores Stage 1, durée/tokens Stage 2, dedup/quota, erreurs Data Broker.

---

## 13. Décisions ouvertes — récapitulatif

| ID | Sujet | Recommandation |
|---|---|---|
| D-AUTO-1 | Mode auto activé par défaut ? | Oui, désactivable |
| D-MAN-1 | Limite sur déclenchements manuels ? | Non |
| D-CADENCE-1 | Tick global 60s ? | Oui par défaut |
| D-QUOTA-1 | 5/h max ? | Oui par défaut |
| D-DEDUP-1 | Seuil cosine 0.85 ? | Oui par défaut |

---

*Fin du document.*
