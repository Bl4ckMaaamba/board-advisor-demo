# Devoir — Étendre l'agent avec un nouveau tool

## Contexte

**Board Advisor** est une plateforme de gouvernance d'entreprise. Son chatbot agentique (`/dashboard/chat`) est construit sur Claude Sonnet 4.6 et orchestre **7 tools externes** en parallèle pour répondre aux questions des administrateurs (RAG documents internes, Pappers, FMP, Brave Search, Legifrance, FRED, etc.).

L'objectif du devoir est de **démontrer que l'architecture de l'agent est extensible** : ajouter un 8ᵉ tool doit prendre quelques minutes, sans toucher au cœur de l'orchestrateur.

## Énoncé

> Ajoutez un tool **`get_bodacc_announcements`** qui permet à l'agent d'interroger le **BODACC** (Bulletin Officiel des Annonces Civiles et Commerciales). Le BODACC est le journal officiel français où sont publiés tous les événements légaux d'entreprise : créations, augmentations de capital, changements de dirigeants, fusions, cessions de fonds de commerce, ouvertures de procédures collectives.
>
> C'est l'un des signaux que tout administrateur surveille sur ses concurrents, ses filiales et ses partenaires. Le complément naturel du tool existant `get_company_info` (qui donne l'état *actuel* via Pappers) — votre tool donne le *fil d'événements* dans le temps.

### Contraintes

- **API publique opendata** : `https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/` — gratuite, sans authentification, dataset `annonces-commerciales`.
- **Aucune clé supplémentaire** à provisionner.
- **Aucune migration DB** : pure lecture externe.
- **Aucune modification d'UI** : le composant `tool-activity.tsx` affichera automatiquement votre tool s'il est correctement déclaré.
- **Suivre exactement le pattern des 7 tools existants** — c'est la démonstration : si l'archi est bonne, il ne devrait pas y avoir de question architecturale à poser.

## Critère de réussite

Au démarrage du dev server (`npm run dev`) :

1. Ouvrir `http://localhost:3000/dashboard/chat`.
2. Poser la question : *« Y a-t-il eu des annonces BODACC concernant Atos ces 6 derniers mois ? »*.
3. Observer dans le **panneau d'activité du chat** (à droite, pendant le streaming) que le tool `get_bodacc_announcements` est invoqué — son libellé doit apparaître proprement (pas l'identifiant brut).
4. La réponse de l'agent doit lister **des annonces réelles et vérifiables**, avec date de parution, type d'avis (création / modification / procédure collective…) et un résumé. Au moins une ligne de source `[Source: BODACC]` doit apparaître dans la sidebar.

## Setup (≈ 5 min)

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement minimales
cp .env.local.example .env.local
# Remplir uniquement :
#   - NEXT_PUBLIC_SUPABASE_URL
#   - NEXT_PUBLIC_SUPABASE_ANON_KEY
#   - SUPABASE_SERVICE_ROLE_KEY
#   - DATABASE_URL
#   - ANTHROPIC_API_KEY
#   - NEXT_PUBLIC_APP_URL=http://localhost:3000
# (les autres clés sont optionnelles pour ce devoir)

# 3. Lancer
npm run dev
```

> Le compte Supabase + la clé Anthropic vous seront fournis séparément.

## Architecture à comprendre avant de coder (≈ 10 min de lecture)

1. Lire la section **"Agent System"** dans [`CLAUDE.md`](./CLAUDE.md) (~30 lignes).
2. Regarder un tool existant simple comme référence : [`src/lib/agent/tools/search-news.ts`](./src/lib/agent/tools/search-news.ts) — sa structure (handler async qui retourne une `Promise<string>` formatée pour le LLM) est exactement celle à reproduire.
3. Comprendre le wiring : [`src/lib/agent/tools/registry.ts`](./src/lib/agent/tools/registry.ts) est l'**unique** point de couplage entre votre handler et l'orchestrateur. Les 4 routes API agent (`/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`) consomment cette registry — vous n'avez rien d'autre à toucher de leur côté.

## L'API BODACC en bref

Endpoint :
```
GET https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/
  ?dataset=annonces-commerciales
  &q=<recherche>
  &rows=<n>
  &sort=-dateparution
```

Réponse (extrait) :
```json
{
  "records": [
    {
      "fields": {
        "dateparution": "2025-11-12",
        "commercant": "ATOS SE",
        "familleavis_lib": "Modification",
        "publicationavis_facette": "BODACC C",
        "cp_ville": "95870 BEZONS",
        "...": "..."
      }
    }
  ]
}
```

Documentation complète : https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/api/

## Les 4 fichiers à modifier

L'extension d'un tool passe par exactement **4 fichiers**. C'est le contrat de l'archi.

### 1. `src/lib/agent/tools/definitions.ts` — Déclarer le tool

Ajouter une entrée dans le tableau `AGENT_TOOLS` selon le format `Anthropic.Tool` :

- `name: "get_bodacc_announcements"`
- `description` : claire et orientée *quand* utiliser le tool (l'agent décide d'appeler le tool en lisant cette description — soyez précis sur la valeur ajoutée vs. `get_company_info`).
- `input_schema` : JSON Schema des paramètres. À minima : `company_name` (obligatoire), `siren` (optionnel, 9 chiffres), `days_back` (optionnel, défaut 180), `event_types` (optionnel, array de types comme `["Création", "Modification", "Procédures collectives"]`).

> Référence : voir l'entrée `search_news` dans le même fichier, qui a une structure de paramètres similaire.

### 2. `src/lib/agent/tools/bodacc.ts` — Implémenter le handler

**Nouveau fichier.** Exporter une fonction qui respecte le type `ToolExecutor` défini dans [`src/lib/agent/types.ts`](./src/lib/agent/types.ts) :

```ts
(input: Record<string, unknown>, boardContext?, documentIds?, userId?) => Promise<string>
```

Logique attendue :

1. Valider et extraire les inputs (`company_name: string`, `siren?: string`, `days_back: number = 180`, `event_types?: string[]`).
2. Construire la query string. Si `siren` est fourni, l'inclure dans `q` ; sinon utiliser `company_name`. Filtrer par date avec `dateparution >= <today - days_back>`.
3. Appeler `fetch` sur l'endpoint BODACC ci-dessus, `rows=15`, `sort=-dateparution`.
4. Parser le JSON, mapper chaque `record.fields` en une ligne lisible : `<date> · <type> · <ville> · <résumé court>`.
5. Retourner une chaîne formatée pour le LLM, avec en première ligne le compte total trouvé et en dernière ligne `[Source: BODACC]` pour que la source apparaisse dans la sidebar.
6. Gérer les erreurs réseau et le cas « 0 résultat » — retourner un message explicite que le LLM peut interpréter.

> Référence : voir [`src/lib/agent/tools/search-news.ts`](./src/lib/agent/tools/search-news.ts) pour la structure handler + formatage + gestion d'erreur.

### 3. `src/lib/agent/tools/registry.ts` — Câbler le handler

- 1 ligne d'`import` du handler.
- 1 entrée dans la map `TOOL_EXECUTORS` : `get_bodacc_announcements: executeBodacc`.

### 4. `src/lib/agent/tools/labels.ts` — Libellé UI

- 1 entrée dans `TOOL_LABELS` : `get_bodacc_announcements: "Annonces BODACC"`.

Ce label est ce que les utilisateurs voient dans le panel d'activité du chat pendant que le tool tourne.

## Vérification

Avant de tester en UI, vérifier :

```bash
npx tsc --noEmit    # 0 erreur attendue
npm run lint        # 0 erreur attendue (les warnings existants sont ok)
```

Puis le test fonctionnel décrit dans **"Critère de réussite"** ci-dessus. Pour valider la qualité du tool, essayer plusieurs requêtes :

- *« Liste les 5 dernières annonces BODACC sur Carrefour »* — doit retourner des annonces récentes datées.
- *« Y a-t-il eu une procédure collective ouverte contre la société XYZ ? »* — l'agent doit filtrer par `event_types`.
- *« Compare l'activité BODACC de Total Energies et Engie sur les 12 derniers mois »* — l'agent doit appeler le tool deux fois en parallèle (démontre l'orchestration parallèle native).

## Pour aller plus loin (si vous avez le temps)

- **Pagination** : que se passe-t-il si la requête a > 15 résultats ? Le tool actuel les tronque. Ajouter un paramètre `offset` ou un message clair.
- **Filtrage par SIREN strict** : aujourd'hui on cherche par texte. Si le SIREN est fourni, utiliser le champ `registre` du BODACC pour un match exact.
- **Composition avec `get_company_info`** : modifier la `description` du tool pour suggérer à l'agent de chaîner « Pappers (état actuel) → BODACC (historique) » sur les questions complexes de due diligence.
- **Tests** : la base n'a aucun test automatisé. Vous pouvez démontrer la qualité du tool en écrivant un test simple (Vitest / Node test runner) qui mocke `fetch` et vérifie le formatage du résultat.

## Ce que cet exercice démontre

- L'agent n'a **aucune connaissance hardcodée** des tools : ils sont entièrement définis par la registry. Ajouter un tool = ajouter une entrée.
- Les 4 routes agent (`/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`) intègrent **automatiquement** le nouveau tool sans modification.
- Le streaming SSE, le panel d'activité UI, et l'extraction des sources fonctionnent **sans aucun changement** côté frontend.
- TypeScript et ESLint garantissent que si une étape est oubliée, le build échoue immédiatement.

Le critère de qualité d'une architecture extensible : **on ne devrait rien avoir à comprendre du cœur du système pour ajouter une feature périphérique**. C'est ce que ce devoir mesure.
