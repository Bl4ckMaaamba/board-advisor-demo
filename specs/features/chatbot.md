# Feature : Chatbot IA Agentique

> Derniere mise a jour : 21 mars 2026

---

## Description

Assistant IA specialise en gouvernance d'entreprise, construit sur Claude Sonnet avec un systeme de tool use. Capable de rechercher des documents internes, des donnees financieres, des actualites, des textes de loi, et des indicateurs macro-economiques en parallele.

---

## Architecture

Le chatbot fonctionne en mode **agentique** :
1. L'utilisateur pose une question
2. Claude Sonnet analyse la question et decide quels outils utiliser
3. Les outils sont executes en parallele (via le data broker)
4. Claude synthetise les resultats en une reponse structuree
5. La reponse est streamee en SSE vers le frontend

---

## 7 outils integres

| Outil | Fonction | Providers |
|-------|----------|-----------|
| `search_internal_documents` | Recherche semantique dans les docs uploades | pgvector + Haiku reranking |
| `get_financial_data` | Cours, ratios, fondamentaux | Financial Modeling Prep |
| `get_company_info` | Profils d'entreprises (SIREN, dirigeants, bilans) | Pappers (FR), OpenCorporates (intl) |
| `search_news` | Actualites et presse | Brave, Tavily, NewsAPI, Google News |
| `check_legal` | Textes de loi et reglementation | Legifrance PISTE (fallback Brave) |
| `get_macro_indicators` | Indicateurs macro-economiques | FRED, World Bank |
| `sector_benchmark` | Comparaisons sectorielles | FMP |

---

## Domaines d'expertise

Le system prompt specialise Claude dans :
- **Droit des societes francais** : Code de commerce, code AFEP-MEDEF, directives AMF
- **Analyse financiere** : ratios financiers, valorisations, due diligence M&A
- **Conformite** : CSRD, Sapin II, RGPD, devoir de vigilance, ESG
- **Gouvernance** : trajectoires climat, Say on Pay, dialogue social, comites

---

## Fonctionnalites UI

- **Streaming SSE** en temps reel (l'utilisateur voit la reponse s'ecrire)
- **Historique des conversations** stocke par board dans Supabase
- **Citations des sources** avec liens vers les documents internes et APIs
- **Blocs riches** : graphiques (bar, line, pie via Recharts), KPIs avec tendances, callouts
- **Indicateur d'activite** des outils pendant la recherche (montre quels outils travaillent)
- **Selecteur de documents** pour restreindre le contexte de recherche
- **Bouton d'arret** fonctionnel (conserve le texte partiel genere)
- **Sidebar de conversations** pour naviguer l'historique

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/agent/system-prompt.ts` | Prompt systeme du chatbot |
| `src/lib/agent/tools/definitions.ts` | Definitions des 7 outils (schemas) |
| `src/lib/agent/tools/registry.ts` | Registre et execution des outils |
| `src/lib/agent/tools/*.ts` | Implementation de chaque outil |
| `src/lib/agent/conversation.ts` | Gestion des conversations (CRUD) |
| `src/lib/agent/formatters.ts` | Formatage des reponses (blocs riches) |
| `src/lib/agent/types.ts` | Types TypeScript |
| `src/lib/agent/index.ts` | Exports |
| `src/app/api/agent/route.ts` | Route API du chat (SSE streaming) |
| `src/app/dashboard/chat/page.tsx` | Page chatbot |
| `src/components/chat/` | Composants UI (sidebar, message, input, document-picker) |

---

## Tables concernees

- `conversations` — Conversations par board et user
- `conversation_messages` — Messages (role user/assistant, contenu, sources, outils utilises)

---

## Flux de donnees

```
Utilisateur → /api/agent (POST, SSE)
  → Claude Sonnet analyse la question
  → Decide des outils a appeler
  → Outils executent en parallele (data broker)
  → Claude synthetise
  → Stream la reponse chunk par chunk
  → Sauvegarde en base (conversation + messages)
```
