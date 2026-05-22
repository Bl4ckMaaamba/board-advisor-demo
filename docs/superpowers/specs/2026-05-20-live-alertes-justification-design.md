# Live — Justification-gated alerts

**Date** : 2026-05-20
**Auteur** : Noah Soulisse
**Statut** : design validé, prêt pour implémentation

## Contexte

Pendant les sessions live, trois pipelines tournent en automatique : fact-check, modération, suggestions (les deux autres — expert panel et angles morts — sont en mode manuel depuis le commit `7974f98`). Lors du dernier test live, ces trois pipelines ont produit un flux d'alertes excessif qui parasite la réunion plus qu'il ne l'aide.

Le public cible — board members — ne tolère pas le bruit. Une alerte qui s'affiche pour rien décrédibilise toutes les suivantes. Le bon comportement est : **silence par défaut, alerte uniquement quand il y a une vraie raison**.

## Décision

On bascule d'un modèle *rate-limited* (cooldowns, quotas, ratios) à un modèle **justification-gated** : chaque alerte candidate est évaluée par un filtre LLM léger qui décide si elle mérite d'être affichée. Si oui, elle s'affiche **sans aucun changement UI** (pas de tooltip "déclenché parce que"). Si non, elle est silencieusement droppée et loggée pour audit.

Non-objectifs explicites :
- Pas de quota max par heure
- Pas de cooldown temporel produit
- Pas d'affichage de la raison côté UI
- Pas de modification de schéma DB

## Filtre d'importance (par pipeline)

Avant tout `writeFactCheck` / `writeModeration` / `writeSuggestion`, on appelle Claude Haiku avec :

```
INPUT: { candidate_alert, recent_transcript, board_context, agenda_text }
OUTPUT: { score: 1..10, criterion: string | null }
```

On publie si et seulement si :
1. `score >= 7`
2. `criterion` ∈ liste blanche du pipeline (voir ci-dessous)

Tout autre cas → drop (fail-closed). Seuil et liste blanche paramétrables dans le code.

### Fact-check — critères autorisés

- `chiffre_materiel` — montant, %, ratio, ranking qui engage une décision (pas "j'ai 3 enfants")
- `allegation_a_effet` — citation d'autorité, attribution publique, statut juridique, info de marché
- `conflit_docs` — le claim contredit ou complète un chiffre des docs board (déjà via RAG)

Pré-filtre regex (`claim-detector.ts`) à resserrer en parallèle : retirer les patterns ultra-larges (`\b(c'est|est le|est la|est un|est une)\b`, `\b(selon|d'après)\b`, `\b(premier|deuxième)\b`) qui matchent trop de phrases banales.

### Modération — critères autorisés (motifs, pas événements)

- `interruption_repetee` — X coupe Y au moins 3 fois sur les 5 dernières minutes
- `monopolisation_persistante` — un speaker à >75% du temps sur les 10 dernières minutes (pas depuis le début de la session)
- `silence_anormal` — un participant listé qui n'a pas parlé pendant >20 minutes

Une interruption isolée, un blanc ponctuel, un déséquilibre sur 30s ne déclenchent plus rien. Le calcul des motifs est fait avant le filtre LLM (le LLM ne fait qu'évaluer si le motif détecté mérite l'alerte étant donné le contexte).

### Suggestions — critères autorisés

- `trou_agenda` — sujet de l'ordre du jour pas encore abordé alors qu'on approche de la fin du temps imparti
- `decision_sans_suite` — la discussion conclut "on fera X" mais personne n'assigne d'owner/deadline
- `info_docs_ignoree` — le board discute un chiffre alors que les docs uploadés contiennent une donnée plus précise/contradictoire
- `enjeu_structurel_manque` — sujet traité tactiquement alors qu'un enjeu stratégique adjacent n'est pas posé

Plus de tick toutes les 45s. Si rien ne mérite, rien ne sort.

## Dedup sémantique

En complément du filtre d'importance, on ajoute un **buffer mémoire des 10 dernières minutes** d'alertes publiées par pipeline. Avant publication, la nouvelle alerte est comparée aux précédentes :

- **Fact-check** : Jaccard ≥ 0.6 sur les tokens significatifs du claim → drop
- **Modération** : même `type` + recouvrement des participants impliqués dans les 10 min → drop
- **Suggestions** : Jaccard ≥ 0.6 sur le `content` → drop

Pattern réutilisé de `src/lib/live/blind-spots/blind-spots-dedup.ts`. Aucune limite de débit en absolu — on n'interdit pas deux alertes proches dans le temps, on interdit deux alertes **sémantiquement identiques** proches dans le temps.

Le buffer est réinitialisé à la fin de chaque session (pas de persistance, pas de fuite cross-meeting).

## Observabilité

À chaque drop, `liveLogger.info` avec un payload structuré :

```json
{
  "event": "alert_dropped",
  "pipeline": "factcheck" | "moderation" | "suggestion",
  "reason": "score_below_threshold" | "out_of_criteria" | "semantic_dedup",
  "score": 5,
  "criterion": "chiffre_materiel" | null,
  "candidate_summary": "premier 50 chars"
}
```

À chaque publication, idem en `liveLogger.info` avec `event: "alert_published"` + le critère retenu et le score. Ça permet de calibrer le seuil après une réunion sans deviner. Aucun dashboard UI — juste les logs.

## Tuning prévu

Seuil d'importance et listes blanches sont des constantes en haut de chaque pipeline. Une fois en prod, l'attente est :

- Si on observe beaucoup de `score_below_threshold` proche de 6/7 → baisser le seuil à 6
- Si on observe trop de `alert_published` jugés inutiles à la revue → monter à 8
- Si on observe beaucoup de `out_of_criteria` sur des cas qui auraient mérité → enrichir la liste blanche

Estimation initiale : **réduction de 70–85%** du nombre d'alertes affichées. À mesurer sur la prochaine session de test.

## Coût

~1 appel Haiku par alerte candidate (~300 tokens, ~$0.0001) + 200–400 ms de latence avant affichage. Sur une réunion d'1h très active : <$0.10 ajouté. Pas de batch — on garde la latence par alerte basse, l'asynchronicité est déjà gérée par l'orchestrator.

## Périmètre

**In** :
- Modifs des 3 pipelines auto : `src/lib/live/pipelines/{fact-checker,moderator,suggester}.ts`
- Resserrement du regex de `claim-detector.ts`
- Nouveau module `src/lib/live/utils/importance-filter.ts` (filtre LLM partagé) et `src/lib/live/utils/semantic-dedup.ts` (buffer sémantique)
- Nouveaux logs structurés via `liveLogger`

**Out** :
- UI inchangée (pas de tooltip de raison, pas de toggle, pas de paramètre user-facing)
- Schéma DB inchangé
- Expert panel et angles morts : déjà en manuel, on n'y touche pas
- Pas de migration Supabase

## Risques

- **Sur-strict au démarrage** : le seuil 7 peut s'avérer trop élevé. Mitigation : seuil paramétrable en une constante, calibrage post-réunion via logs.
- **Latence visible** : +200–400 ms par alerte. Vu qu'aujourd'hui les alertes arrivent déjà avec quelques secondes de décalage (transcription + détection), c'est probablement imperceptible. À confirmer.
- **Faux négatifs sur les motifs de modération** : un participant qui est interrompu 2 fois (sous seuil) et qui se tait après ne déclenchera rien. Acceptable — c'est le coût du silence par défaut.
