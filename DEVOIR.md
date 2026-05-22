# Devoir — Étendre l'agent avec un nouveau tool

## Contexte

**Board Advisor** est une plateforme de gouvernance d'entreprise. Son chatbot agentique (`/dashboard/chat`) est construit sur Claude Sonnet 4.6 et orchestre **7 tools externes** en parallèle pour répondre aux questions des administrateurs (RAG documents internes, Pappers, FMP, Brave Search, Legifrance, FRED, etc.).

L'objectif du devoir est de **démontrer que l'architecture de l'agent est extensible** : ajouter un 8ᵉ tool doit prendre quelques minutes, sans toucher au cœur de l'orchestrateur.

## Énoncé

> Ajoutez un tool **`convert_currency`** qui permet à l'agent de convertir des montants entre devises. Quand un administrateur écrit dans le chat *« Combien font 250 000 € en USD ? »*, l'agent doit pouvoir appeler ce tool, qui interroge l'API publique de Frankfurter (basée sur les taux de la BCE) et retourne le montant converti.

### Contraintes

- **Aucune clé API supplémentaire** : Frankfurter (`https://api.frankfurter.app`) est libre et public.
- **Aucune migration DB** : le tool est pure lecture, pas de persistence.
- **Aucune modification d'UI** : le composant `tool-activity.tsx` affichera automatiquement votre tool s'il est correctement déclaré.
- **Suivre exactement le pattern des 7 tools existants** — c'est la démonstration : si l'archi est bonne, il ne devrait pas y avoir de question architecturale à poser.

## Critère de réussite

Au démarrage du dev server (`npm run dev`) :

1. Ouvrir `http://localhost:3000/dashboard/chat`.
2. Poser la question : *« Convertis 100 000 EUR en USD avec le taux du jour »*.
3. Observer dans le **panneau d'activité du chat** (à droite, pendant le streaming) que le tool `convert_currency` est invoqué — son libellé doit apparaître proprement (pas l'identifiant brut).
4. La réponse de l'agent doit donner un montant **chiffré et plausible** (≈ 105 000 – 115 000 USD selon le taux du jour), pas une approximation textuelle inventée.

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
2. Regarder un tool existant simple comme référence : [`src/lib/agent/tools/search-news.ts`](./src/lib/agent/tools/search-news.ts) — sa structure (handler async qui retourne une `Promise<string>`) est exactement celle à reproduire.
3. Comprendre le wiring : [`src/lib/agent/tools/registry.ts`](./src/lib/agent/tools/registry.ts) est l'**unique** point de couplage entre votre handler et l'orchestrateur. Les 4 routes API agent (`/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`) consomment cette registry — vous n'avez rien d'autre à toucher de leur côté.

## Les 4 fichiers à modifier

L'extension d'un tool passe par exactement **4 fichiers**. C'est le contrat de l'archi.

### 1. `src/lib/agent/tools/definitions.ts` — Déclarer le tool

Ajouter une entrée dans le tableau `AGENT_TOOLS` selon le format `Anthropic.Tool` :

- `name: "convert_currency"`
- `description` : claire et orientée *quand* utiliser le tool (l'agent décide d'appeler le tool en lisant cette description — soyez précis).
- `input_schema` : JSON Schema des paramètres attendus (à minima `amount`, `from`, `to`).

> Référence : voir l'entrée `get_macro_indicators` dans le même fichier.

### 2. `src/lib/agent/tools/convert-currency.ts` — Implémenter le handler

**Nouveau fichier.** Exporter une fonction qui respecte le type `ToolExecutor` défini dans [`src/lib/agent/types.ts`](./src/lib/agent/types.ts) :

```ts
(input: Record<string, unknown>, boardContext?, documentIds?, userId?) => Promise<string>
```

- Valider les inputs (`amount: number`, `from: string`, `to: string`).
- Appeler `GET https://api.frankfurter.app/latest?from={FROM}&to={TO}&amount={AMOUNT}`.
- Retourner une chaîne lisible par le LLM, incluant le montant converti, le taux, et la date du taux. Inclure une mention `[Source: Frankfurter / ECB]` à la fin pour que la source apparaisse dans la sidebar.

> Référence : voir [`src/lib/agent/tools/search-news.ts`](./src/lib/agent/tools/search-news.ts) pour la structure handler + gestion d'erreur.

### 3. `src/lib/agent/tools/registry.ts` — Câbler le handler

- 1 ligne d'`import` du handler.
- 1 entrée dans la map `TOOL_EXECUTORS` : `convert_currency: executeConvertCurrency`.

### 4. `src/lib/agent/tools/labels.ts` — Libellé UI

- 1 entrée dans `TOOL_LABELS` : `convert_currency: "Conversion de devises"`.

Ce label est ce que les utilisateurs voient dans le panel d'activité du chat pendant que le tool tourne.

## Vérification

Avant de tester en UI, vérifier :

```bash
npx tsc --noEmit    # 0 erreur attendue
npm run lint        # 0 erreur attendue (les warnings existants sont ok)
```

Puis le test fonctionnel décrit dans **"Critère de réussite"** ci-dessus.

## Pour aller plus loin (si vous avez le temps)

- **Gestion d'erreur** : que se passe-t-il si l'utilisateur demande une devise inexistante (ex: « XYZ ») ? Le handler doit retourner une chaîne explicite que le LLM peut interpréter, pas planter.
- **Format français** : `100000` → `100 000` dans la réponse formatée.
- **Tests** : la base n'a aucun test automatisé. Vous pouvez démontrer la qualité du tool en écrivant un test simple (Vitest / Node test runner) pour la fonction de parsing/formatage.

## Ce que cet exercice démontre

- L'agent n'a **aucune connaissance hardcodée** des tools : ils sont entièrement définis par la registry. Ajouter un tool = ajouter une entrée.
- Les 4 routes agent (`/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`) intègrent **automatiquement** le nouveau tool sans modification.
- Le streaming SSE, le panel d'activité UI, et l'extraction des sources fonctionnent **sans aucun changement** côté frontend.
- TypeScript et ESLint garantissent que si une étape est oubliée, le build échoue immédiatement.

Le critère de qualité d'une architecture extensible : **on ne devrait rien avoir à comprendre du cœur du système pour ajouter une feature périphérique**. C'est ce que ce devoir mesure.
