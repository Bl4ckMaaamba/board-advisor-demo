# Data Broker - Documentation Technique

## Architecture

Le Data Broker est un système d'orchestration en 5 couches qui route les requêtes utilisateur vers des APIs externes, normalise les réponses en DataPackets standardisés, et les délivre avec traçabilité complète.

```
Requête utilisateur
       |
  Layer 1 - Ingress (Classification LLM + Extraction d'entités)
       |
  Layer 2 - Orchestration (Exécution parallèle + Circuit Breaker + Cost Controller)
       |
  Layer 3 - Providers (10 connecteurs API)
       |
  Layer 4 - Normalisation & Cache (L1 Memory / L2 Redis / L3 Supabase)
       |
  Layer 5 - Egress (Déduplication + Détection de conflits + Merge)
       |
  DataPackets normalisés
```

## Providers (10)

| Provider | Catégorie | Status | Fallback | Coût/req |
|----------|-----------|--------|----------|----------|
| Brave Search | press, finance, esg | OK | tavily | 0€ |
| Tavily | press, finance, esg | OK | brave_search | 0€ |
| FMP | finance | OK | - | 0.001€ |
| Pappers | finance | OK | opencorporates | 0.003€ |
| Legifrance (PISTE) | legal | 403 (fallback) | brave_search | 0€ |
| FRED | macro | OK | world_bank | 0€ |
| NewsAPI | press | Sans clé API | google_news_rss | 0€ |
| World Bank | macro | OK | - | 0€ |
| OpenCorporates | finance | OK | - | 0€ |
| Google News RSS | press | OK | - | 0€ |

## Intents supportés

| Intent | Providers activés | Exemple |
|--------|-------------------|---------|
| benchmark | fmp, pappers, brave_search | "PE ratio de LVMH" |
| fact_check | brave_search, tavily, newsapi | "Carrefour a racheté Casino ?" |
| news | newsapi, google_news_rss, tavily, brave_search | "Actualités automobile France" |
| legal | legifrance (-> brave_search fallback) | "Article L225-35 code de commerce" |
| macro | fred, world_bank | "Taux de chômage France" |
| esg | brave_search, tavily | "Score ESG TotalEnergies" |

## Cache 3 niveaux

| Niveau | Technologie | Condition | TTL |
|--------|-------------|-----------|-----|
| L1 | LRU in-memory | Toujours | TTL du data type |
| L2 | Upstash Redis | TTL >= 5 min | TTL du data type |
| L3 | Supabase PostgreSQL | TTL >= 24h | TTL du data type |

TTL par type de données :
- stock_prices: 5 min
- web_search: 30 min
- press/articles: 1h
- macro: 24h
- company_data: 7 jours
- laws: 7 jours
- financial_ratios: 30 jours
- esg: 30 jours

## Circuit Breaker

- **Seuil** : 3 échecs consécutifs en 5 minutes
- **Durée open** : 60 secondes
- **Transition** : closed -> open (3 échecs) -> half_open (après 60s) -> closed (1 succès)
- **Fallback** : quand le circuit est ouvert, le fallback provider est automatiquement utilisé

## Cost Controller

- **Par requête** : max 0.05€
- **Par board/mois** : max 50€ (alerte à 80%)
- **Global/mois** : max 400€
- Tracking via Redis avec clés `cost:global:YYYY-MM`

## API Endpoints

### POST /api/data-broker
```json
{
  "query": "PE ratio de LVMH",
  "mode": "chatbot | fact_check | briefing",
  "board_context": {
    "board_id": "optional",
    "company_name": "optional",
    "sector": "optional"
  }
}
```

Réponse :
```json
{
  "query_id": "uuid",
  "packets": [DataPacket],
  "total_cost_eur": 0.004,
  "total_latency_ms": 1200,
  "provider_statuses": { "fmp": "success", "brave_search": "cache_hit" }
}
```

### GET /api/data-broker/health
Retourne le status de tous les providers, circuit breakers, Redis, et coûts mensuels.

## DataPacket (schéma Zod)

```typescript
{
  id: string;           // UUID
  query_id: string;     // UUID de la requête parente
  provider: string;     // ex: "fmp", "fred"
  category: string;     // "finance" | "press" | "legal" | "macro" | "esg"
  data_type: string;    // "metric" | "article" | "timeseries" | "document" | "rating"
  content: object;      // MetricContent | ArticleContent | TimeseriesContent | ...
  confidence: number;   // 0.0 - 1.0
  freshness: string;    // ISO date
  ttl: number;          // secondes
  cost_eur: number;
  latency_ms: number;
  conflicts: Conflict[] | null;
}
```

## Variables d'environnement requises

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Search
BRAVE_API_KEY=
TAVILY_API_KEY=

# Finance
FMP_API_KEY=
PAPPERS_API_KEY=

# News (optionnel)
NEWSAPI_API_KEY=

# Legal
PISTE_CLIENT_ID=
PISTE_CLIENT_SECRET=

# Macro
FRED_API_KEY=

# Cache L2
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# LLM Classifier
ANTHROPIC_API_KEY=
```

## Table Supabase requise

```sql
CREATE TABLE data_broker_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  packets jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_cache_key ON data_broker_cache(cache_key);
CREATE INDEX idx_expires_at ON data_broker_cache(expires_at);
```

## Tests de production (résultats)

| Test | Résultat |
|------|----------|
| 10 providers individuels | 9/10 OK (Legifrance 403 -> fallback Brave) |
| 6 intents | Tous fonctionnels |
| Fallback chains | Legifrance->Brave, NewsAPI->Google RSS |
| Circuit breaker | closed->open (3 échecs)->fallback |
| Cache L1->L2->L3 | 747ms -> 25ms (30x speedup) |
| Résilience | Query vide, SQL injection, XSS -> rejetés |
| 5 requêtes parallèles | 2.8s total, aucune dégradation |
| TypeScript | 0 erreurs |

## Bugs corrigés (audit production)

1. **FMP** : API v3 dépréciée -> migré vers /stable/ avec ticker map (30+ entreprises)
2. **Legifrance** : 403 sur search -> fallback automatique Brave Search
3. **Circuit breaker** : bug dans recordSuccess (log après reset)
4. **Circuit open** : ne déclenchait pas le fallback -> corrigé (throw CircuitOpenError)
5. **Entity extraction** : capturait les mots français ("Quel", "Est") -> filtre stopwords
6. **env.local.example** : variables manquantes ajoutées

## Prochaine étape : Couche de synthèse LLM (RAG)

Le Data Broker est le "R" (Retrieval) du RAG. Pour compléter le système, il faut ajouter la couche "G" (Generation) :

```
Question -> Data Broker (retrieval) -> DataPackets -> LLM Claude (synthèse) -> Réponse naturelle
```

Actuellement : les DataPackets sont affichés bruts dans le chat.
Objectif : les injecter comme contexte dans un prompt Claude pour générer une réponse naturelle, sourcée et structurée.
