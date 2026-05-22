# Devoir — Étendre l'agent avec un nouveau tool

## Contexte

**Board Advisor** est une plateforme de gouvernance d'entreprise. Son chatbot agentique (`/dashboard/chat`) est construit sur Claude Sonnet 4.6 et orchestre **7 tools externes** en parallèle pour répondre aux questions des administrateurs (RAG documents internes, Pappers, FMP, Brave Search, Legifrance, FRED, etc.).

L'objectif du devoir est de **démontrer que l'architecture de l'agent est extensible** : ajouter un 8ᵉ tool — production-ready, composable avec les tools existants — doit prendre une trentaine de minutes, sans toucher au cœur de l'orchestrateur.

## Énoncé

> Ajoutez un tool **`get_bodacc_announcements`** qui permet à l'agent d'interroger le **BODACC** (Bulletin Officiel des Annonces Civiles et Commerciales). Le BODACC est le journal officiel français où sont publiés tous les événements légaux d'entreprise : créations, augmentations de capital, changements de dirigeants, fusions, cessions de fonds de commerce, ouvertures de procédures collectives.
>
> C'est l'un des signaux que tout administrateur surveille sur ses concurrents, ses filiales et ses partenaires. Le complément naturel du tool existant `get_company_info` (qui donne l'état *actuel* via Pappers) — votre tool donne le *fil d'événements* dans le temps.

### Exigences fonctionnelles

Le tool doit satisfaire les **4 exigences** suivantes, toutes obligatoires :

1. **Handler de base** — fetch sur l'API BODACC, parsing du JSON, formatage du résultat en chaîne lisible par le LLM avec une ligne par annonce (`<date> · <type> · <ville> · <résumé>`), première ligne = nombre total trouvé, dernière ligne = `[Source: BODACC]` pour l'extraction automatique de source.

2. **Pagination** — si la requête retourne plus de 15 résultats, le tool doit soit gérer une vraie pagination via un paramètre `offset` (optionnel, défaut 0), soit indiquer explicitement dans la sortie *« X autres annonces disponibles — affinez la requête (SIREN, plage de dates plus courte, ou filtrage par type) pour les voir »*. L'utilisateur ne doit jamais avoir l'impression que les données ont été tronquées silencieusement.

3. **Filtrage SIREN strict** — si l'input `siren` est fourni (9 chiffres), le tool doit utiliser le champ `registre` du BODACC pour un match **exact**, pas une recherche textuelle floue (qui retourne souvent des faux positifs sur les filiales homonymes). Si seul `company_name` est fourni, recherche textuelle classique.

4. **Composition avec `get_company_info`** — la `description` du tool dans `AGENT_TOOLS` doit **explicitement** suggérer à l'agent de chaîner Pappers + BODACC pour les questions de due diligence (ex : *« Utilisez ce tool en complément de `get_company_info` : Pappers donne l'état actuel d'une société, BODACC donne l'historique des événements légaux. Pour une analyse de due diligence complète, appelez d'abord `get_company_info` pour récupérer le SIREN, puis ce tool avec le SIREN en input pour un match exact »*).

### Contraintes

- **API publique opendata** : `https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/` — gratuite, sans authentification, dataset `annonces-commerciales`.
- **Aucune clé supplémentaire** à provisionner.
- **Aucune migration DB** : pure lecture externe.
- **Aucune modification d'UI** : le composant `tool-activity.tsx` affichera automatiquement votre tool s'il est correctement déclaré.
- **Suivre exactement le pattern des 7 tools existants** — c'est la démonstration : si l'archi est bonne, il ne devrait pas y avoir de question architecturale à poser.

## Critère de réussite

Les 5 vérifications suivantes doivent toutes passer (4 scénarios chat + le build) :

### 1. Requête simple — le tool est appelé et retourne des données réelles

Sur `/dashboard/chat`, poser : *« Y a-t-il eu des annonces BODACC concernant Atos ces 6 derniers mois ? »*

Attendu :
- Le tool `get_bodacc_announcements` apparaît dans le panneau d'activité (à droite, pendant le streaming) avec son libellé FR (« Annonces BODACC »).
- La réponse de l'agent liste des annonces réelles, datées, vérifiables sur [bodacc.fr](https://www.bodacc.fr) — pas une hallucination.
- `BODACC` apparaît comme source dans la sidebar des sources de la réponse.

### 2. Pagination — gestion explicite des résultats nombreux

Poser : *« Liste toutes les annonces BODACC de Total Energies depuis 2 ans »*.

Attendu : la sortie indique soit qu'il y a plus de résultats disponibles (avec instruction pour affiner), soit qu'une pagination est en place. Aucune troncature silencieuse.

### 3. SIREN strict — pas de faux positifs

Poser : *« Annonces BODACC pour le SIREN 552120222 »* (Renault SA).

Attendu : toutes les annonces retournées concernent Renault SA (la maison-mère), aucune filiale homonyme.

### 4. Composition Pappers + BODACC — chaînage automatique

Poser : *« Fais-moi un point de due diligence sur la société Carrefour : état actuel et historique des événements légaux »*.

Attendu : dans le panneau d'activité, voir **les deux tools s'exécuter** : `get_company_info` (Pappers) **puis** `get_bodacc_announcements`. L'agent doit avoir compris le chaînage grâce à la `description` du tool.

### 5. Build propre

```bash
npx tsc --noEmit    # 0 erreur
npm run lint        # 0 erreur (les warnings existants sont ok)
```

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
  &start=<offset>           ← pour la pagination
  &sort=-dateparution
  &refine.registre=<siren>  ← pour le match SIREN strict (exigence 3)
```

Réponse (extrait) :
```json
{
  "nhits": 423,
  "records": [
    {
      "fields": {
        "dateparution": "2025-11-12",
        "commercant": "ATOS SE",
        "registre": "323623603 R.C.S. Pontoise",
        "familleavis_lib": "Modification",
        "publicationavis_facette": "BODACC C",
        "cp_ville": "95870 BEZONS",
        "...": "..."
      }
    }
  ]
}
```

`nhits` donne le total réel sur le serveur — utilisez ce champ pour la pagination (exigence 2).

Documentation complète : https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/api/

## Les fichiers à modifier / créer

L'extension d'un tool passe par exactement **4 fichiers** : 3 modifications + 1 nouveau fichier.

### 1. `src/lib/agent/tools/definitions.ts` — Déclarer le tool

Ajouter une entrée dans le tableau `AGENT_TOOLS` selon le format `Anthropic.Tool` :

- `name: "get_bodacc_announcements"`
- `description` : claire et orientée *quand* utiliser le tool — **doit inclure la consigne de chaînage avec `get_company_info`** (exigence 4).
- `input_schema` : `company_name` (obligatoire), `siren` (optionnel, 9 chiffres), `days_back` (optionnel, défaut 180), `event_types` (optionnel, array), `offset` (optionnel, défaut 0).

> Référence : voir l'entrée `search_news` dans le même fichier.

### 2. `src/lib/agent/tools/bodacc.ts` — Implémenter le handler

**Nouveau fichier.** Exporter une fonction qui respecte le type `ToolExecutor` défini dans [`src/lib/agent/types.ts`](./src/lib/agent/types.ts) :

```ts
(input: Record<string, unknown>, boardContext?, documentIds?, userId?) => Promise<string>
```

Logique attendue :

1. Valider et extraire les inputs.
2. Construire la query string. Si `siren` est fourni → utiliser `refine.registre=<siren>` (exigence 3). Sinon → `q=<company_name>`. Inclure filtre date avec `dateparution >= <today - days_back>` et `start=<offset>`.
3. Appeler `fetch` sur l'endpoint BODACC, `rows=15`.
4. Parser le JSON, mapper chaque `record.fields` en une ligne lisible.
5. Retourner une chaîne formatée pour le LLM, avec en première ligne le compte trouvé / `nhits` (exigence 2), ligne(s) d'annonces, puis dernière ligne `[Source: BODACC]`.
6. Gérer les erreurs réseau et le cas « 0 résultat ».

> Référence : [`src/lib/agent/tools/search-news.ts`](./src/lib/agent/tools/search-news.ts) pour la structure handler + formatage + gestion d'erreur.

### 3. `src/lib/agent/tools/registry.ts` — Câbler le handler

- 1 ligne d'`import` du handler.
- 1 entrée dans la map `TOOL_EXECUTORS` : `get_bodacc_announcements: executeBodacc`.

### 4. `src/lib/agent/tools/labels.ts` — Libellé UI

- 1 entrée dans `TOOL_LABELS` : `get_bodacc_announcements: "Annonces BODACC"`.

## Vérification finale

```bash
npx tsc --noEmit    # 0 erreur
npm run lint        # 0 erreur
npm run dev         # serveur démarre sans warning
```

Puis exécuter manuellement les **4 scénarios chat** du **Critère de réussite** ci-dessus dans `/dashboard/chat`.

## Ce que cet exercice démontre

- L'agent n'a **aucune connaissance hardcodée** des tools : ils sont entièrement définis par la registry. Ajouter un tool = ajouter une entrée.
- Les 4 routes agent (`/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`) intègrent **automatiquement** le nouveau tool sans modification.
- Le streaming SSE, le panel d'activité UI, et l'extraction des sources fonctionnent **sans aucun changement** côté frontend.
- TypeScript et ESLint garantissent que si une étape de wiring est oubliée, le build échoue immédiatement.
- La **composition entre tools** ne demande aucune logique d'orchestration custom : l'agent chaîne `get_company_info` → `get_bodacc_announcements` simplement parce que les `description` de chaque tool sont écrites pour s'auto-suggérer entre elles.

Le critère de qualité d'une architecture extensible : **on ne devrait rien avoir à comprendre du cœur du système pour ajouter une feature périphérique production-ready (paginée, composable)**. C'est ce que ce devoir mesure.
