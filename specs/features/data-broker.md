# Feature : Data Broker — Integration de Donnees Externes

> Derniere mise a jour : 21 mars 2026

---

## Description

Systeme a 5 couches qui route les requetes du chatbot vers 10 fournisseurs de donnees externes. Gere l'execution parallele, le cache multi-niveaux, le controle des couts et la normalisation des resultats.

---

## Architecture 5 couches

### Layer 1 — Ingress (Classification)

| Fichier | Role |
|---------|------|
| `classifier.ts` | Classification LLM (Haiku) de la requete → type de donnees recherchees |
| `context-injector.ts` | Injection du contexte board (secteur, profil sectoriel) |
| `query-planner.ts` | Planification des requetes → quels providers appeler |

### Layer 2 — Orchestration

| Fichier | Role |
|---------|------|
| `execution-engine.ts` | Execution parallele des requetes vers les providers |
| `circuit-breaker.ts` | Protection contre les providers defaillants (retry, fallback) |
| `cost-controller.ts` | Controle des couts par requete, par board, global |

### Layer 3 — Providers (10 APIs)

| Provider | Fichier | Donnees | Cle API |
|----------|---------|---------|---------|
| Brave Search | `brave-search.ts` | Recherche web | `BRAVE_API_KEY` |
| Tavily | `tavily.ts` | Recherche web (alternative) | `TAVILY_API_KEY` |
| Financial Modeling Prep | `fmp.ts` | Cours, ratios, fondamentaux | `FMP_API_KEY` |
| Pappers | `pappers.ts` | Entreprises FR (SIREN, dirigeants, bilans) | `PAPPERS_API_KEY` |
| Legifrance PISTE | `legifrance.ts` | Textes de loi (FR) | — (OAuth) |
| FRED | `fred.ts` | Indicateurs macro US | `FRED_API_KEY` |
| World Bank | `world-bank.ts` | Indicateurs macro mondiaux | — (gratuit) |
| NewsAPI | `newsapi.ts` | Actualites | `NEWSAPI_API_KEY` |
| Google News RSS | `google-news-rss.ts` | Actualites (gratuit, RSS) | — |
| OpenCorporates | `opencorporates.ts` | Entreprises internationales | — (gratuit) |

Le `registry.ts` centralise l'enregistrement de tous les providers.

### Layer 4 — Normalisation + Cache

**Normalisation** : chaque provider a un normalizer dedie qui transforme sa reponse brute en format uniforme (`DataPacket`).

**Cache 3 niveaux** :

| Niveau | Implementation | TTL | Usage |
|--------|---------------|-----|-------|
| L1 | LRU-cache (memoire) | Court | Requetes repetees dans la meme session |
| L2 | Upstash Redis | Moyen | Requetes repetees entre sessions |
| L3 | Supabase PostgreSQL | Long | Donnees stables (profils entreprise, lois) |

Le `cache-manager.ts` gere la hierarchie (cherche L1, puis L2, puis L3, puis fetch).

### Layer 5 — Egress (Fusion)

| Fichier | Role |
|---------|------|
| `source-tagger.ts` | Tague chaque resultat avec sa source |
| `conflict-detector.ts` | Detecte les donnees contradictoires entre providers |
| `data-merger.ts` | Fusionne et deduplique les resultats |
| `delivery-adapter.ts` | Formate pour le chatbot (format tool_result) |

---

## Controle des couts

| Limite | Valeur |
|--------|--------|
| Par requete | Max 0.05 EUR |
| Par board/mois | Max 50 EUR |
| Global/mois | Max 400 EUR |

Le `cost-controller.ts` verifie les limites avant chaque appel API.

---

## Fichiers cles

```
src/lib/data-broker/
├── index.ts                          # Point d'entree
├── schemas/                          # Schemas Zod (data-packet, query-params, query-plan)
├── utils/                            # Logger, errors, env
├── layer1-ingress/                   # Classification + planification
├── layer2-orchestration/             # Execution + circuit-breaker + couts
├── layer3-providers/                 # 10 providers + registry + types
├── layer4-normalize-cache/
│   ├── cache/                        # 3 niveaux de cache
│   └── normalizers/                  # Normalizers par provider
└── layer5-egress/                    # Fusion + dedup + livraison
```

---

## Limitations

- Legifrance PISTE retourne actuellement 403 → fallback Brave Search
- OpenCorporates et World Bank sont gratuits mais avec rate limiting
- Le cache L2 (Redis) necessite un compte Upstash configure
