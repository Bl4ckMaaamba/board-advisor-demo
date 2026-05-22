# CAHIER DES CHARGES — Board Advisor
## Extension des fonctionnalités des 4 boutons de l'interface

**Version :** 1.0
**Date :** 13 avril 2026
**Produit :** Board Advisor — Assistant de gouvernance pour administrateurs
**Périmètre :** Activation et spécialisation des 4 boutons (Pièce jointe, Recherche, Réflexion, Canvas)

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Produit existant
Board Advisor est un assistant IA dédié aux **administrateurs et membres de conseils d'administration**, principalement pour la **préparation de réunions de board**. Il analyse des documents de gouvernance (PV, rapports, projets de résolution, états financiers) et mobilise un databroker interne pour des benchmarks et vérifications externes.

### 1.2 Socle technique déjà en place
Toutes les fonctionnalités de base sont **actives automatiquement** à chaque conversation :
- Lecture de documents écrits (PDF, DOCX, MD, TXT)
- Databroker multi-sources :
  - **Juridique/réglementaire** : Légifrance, AMF, AFEP-MEDEF, Sapin II, CSRD
  - **Entreprise** : Pappers, OpenCorporates
  - **Financier/marché** : Financial Modeling Prep, FRED, World Bank, Sector Benchmark
  - **Presse** : Brave Search, Tavily, NewsAPI, Google News
- Modèle LLM par défaut : **Claude Sonnet 4.6** (via clé API Anthropic existante)

### 1.3 Objectif du CDC
Chaque bouton de l'interface doit apporter une **capacité supplémentaire spécialisée** activée à la demande, au-dessus du socle. Chaque bouton = un mode de travail spécifique pour l'administrateur.

### 1.4 Principe directeur
**Architecture multi-modèles** : le meilleur modèle du marché est sélectionné pour chaque tâche spécifique, sans dogmatisme d'écosystème.

---

## 2. VUE D'ENSEMBLE DES 4 BOUTONS

| Bouton | Capacité ajoutée | Modèle/service | Clé API |
|--------|------------------|----------------|---------|
| 📎 **Pièce jointe** | Vision multimodale (images, photos, graphiques) | Gemini 3.1 Pro | Google AI Studio (nouvelle) |
| 🌐 **Recherche** | Deep Research agentique sourcé | Perplexity Sonar Deep Research | Perplexity (nouvelle) |
| 🧠 **Réflexion** | Reasoning avancé (Extended Thinking) | Claude Opus 4.6 | Anthropic (existante) |
| 📝 **Canvas** | Édition collaborative de livrables | Claude Sonnet 4.6 (+ Opus optionnel) | Anthropic (existante) |

---

## 3. SPÉCIFICATIONS FONCTIONNELLES PAR BOUTON

---

### 3.1 📎 BOUTON PIÈCE JOINTE — Extension Vision

#### 3.1.1 État actuel
Le bouton fonctionne déjà pour les documents écrits (PDF, DOCX, MD). Les images ne sont **pas lues**.

#### 3.1.2 Besoin
Permettre à l'administrateur d'uploader **tout type de contenu visuel** rencontré dans un contexte de board :
- Photos de documents physiques (PV signés manuellement, contrats scannés de mauvaise qualité)
- Captures d'écran (slides de présentations, dashboards, extraits de rapports)
- Graphiques et courbes financières (à lire ET interpréter)
- Organigrammes, structures capitalistiques, schémas de gouvernance
- Tableaux photographiés, signatures, tampons, mentions manuscrites

#### 3.1.3 Spécifications techniques

**Modèle :** `gemini-3.1-pro` via Google AI Studio API

**Justification du choix :**
- Leader multimodal 2026 (référence sectorielle pour vision + vidéo + document understanding)
- Contexte 2M tokens → capacité de traiter une liasse de board complète en un seul appel
- Coût avantageux : $2 input / $12 output par million de tokens
- OCR robuste sur documents bruités, scans, photos de mauvaise qualité

**Formats supportés en upload :**
- Images : JPG, JPEG, PNG, WEBP, HEIC (photos iPhone)
- PDF avec pages images (scans)
- Multi-fichiers simultanés (jusqu'à 20 fichiers / upload)

**Logique de routing :**
```
Si fichier uploadé contient image(s)
    → Appel Gemini 3.1 Pro
    → Extraction texte + description visuelle
    → Passage du contenu extrait au modèle de base (Sonnet 4.6) pour analyse
Sinon (texte pur)
    → Pipeline actuel inchangé
```

**Fallback en cas d'erreur API Gemini :**
- Basculer automatiquement sur Claude Sonnet 4.6 (vision intégrée)
- Logger l'erreur pour monitoring

#### 3.1.4 Critères d'acceptation
- [ ] Upload d'une photo de PV signé → OCR correct à 95%+
- [ ] Upload d'un graphique (histogramme CA par trimestre) → lecture des valeurs + interprétation
- [ ] Upload d'un organigramme → restitution de la structure hiérarchique
- [ ] Upload multi-fichiers (5+ images) → traitement sans timeout
- [ ] Latence moyenne : < 10 secondes par image

---

### 3.2 🌐 BOUTON RECHERCHE — Deep Research Agent

#### 3.2.1 État actuel
Le databroker effectue des requêtes ciblées et rapides vers ses sources configurées.

#### 3.2.2 Besoin
Quand l'administrateur clique sur le bouton Recherche, il active un mode **investigation approfondie** : l'agent décompose la question, interroge le web en multi-étapes, croise les sources, détecte les contradictions, et produit un **rapport sourcé complet** (comparable à une due diligence).

**Cas d'usage typiques :**
- "Due diligence complète sur la société cible de l'acquisition prévue en résolution 7"
- "Contexte concurrentiel et réglementaire du secteur X sur les 12 derniers mois"
- "Antécédents professionnels et mandats du candidat administrateur Y"
- "Analyse ESG comparative de notre secteur (top 10 mondiaux)"

#### 3.2.3 Spécifications techniques

**Service :** Perplexity Sonar Deep Research API

**Endpoint :** `https://api.perplexity.ai/chat/completions`
**Modèle :** `sonar-deep-research`

**Justification du choix :**
- Citation accuracy 94.3% (benchmark avril 2026) — indispensable pour citabilité en séance
- Agent multi-étapes autonome : décompose, cherche, synthétise
- Prix raisonnable : ~$0.40 par requête complète
- Sources traçables, URL cliquables

**Pricing :**
- Input : $2 / million tokens
- Output : $8 / million tokens
- Searches : $5 / 1000 recherches
- Reasoning tokens : $3 / million tokens

**UX d'activation :**
```
Utilisateur clique sur 🌐 Recherche
    → Message indicateur : "Mode Deep Research activé — cette recherche peut prendre 2 à 5 minutes"
    → Barre de progression (étapes : Planification → Recherche → Synthèse → Rapport)
    → Sortie : rapport structuré avec :
        * Synthèse exécutive (3-5 lignes)
        * Sections thématiques
        * Citations inline [1][2][3]
        * Bibliographie cliquable en fin de rapport
```

**Complémentarité avec le databroker existant :**
- Databroker = sources structurées internes (Pappers, Légifrance, FMP...)
- Sonar Deep Research = synthèse web ouverte sourcée
- Les deux s'exécutent en parallèle ; le résultat final croise les deux types de sources

**Gestion des limites :**
- Timeout max : 5 minutes par requête
- Rate limiting : 20 Deep Research / jour / utilisateur (configurable)
- Quota mensuel organisation avec alerte à 80%

#### 3.2.4 Critères d'acceptation
- [ ] Une requête type "due diligence" produit un rapport de 1500+ mots
- [ ] Toutes les affirmations du rapport sont sourcées avec URL vérifiable
- [ ] Au moins 10 sources différentes consultées par requête
- [ ] Taux de hallucination < 5% (validation manuelle sur 20 rapports tests)
- [ ] Export du rapport en PDF / DOCX depuis l'interface

---

### 3.3 🧠 BOUTON RÉFLEXION — Reasoning Avancé

#### 3.3.1 État actuel
Le modèle de base (Sonnet 4.6) répond directement aux questions, sans phase de raisonnement approfondi visible.

#### 3.3.2 Besoin
Pour les questions **juridiquement complexes, financièrement sensibles, ou stratégiquement lourdes**, l'administrateur a besoin d'un niveau de raisonnement comparable à celui d'un expert senior qui "prend le temps de penser" avant de répondre.

**Cas d'usage typiques :**
- "Cette opération de fusion présente-t-elle un risque de conflit d'intérêts au regard du Code de commerce ET des recommandations AFEP-MEDEF ?"
- "Analyse les écarts entre les états financiers annexés et les commentaires du rapport du directeur général"
- "Identifie les 5 risques juridiques majeurs de cette résolution si je vote pour"
- "Construis ma position motivée pour un vote contre la résolution 4"

#### 3.3.3 Spécifications techniques

**Modèle :** `claude-opus-4-6` avec `extended_thinking` activé

**API :** Anthropic (clé existante, pas de nouvelle intégration)

**Paramètres d'appel :**
```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 16000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 16000
  },
  "messages": [...]
}
```

**Justification du choix :**
- Leader GDPval-AA Elo (1633 vs 1317 pour concurrents) — préférence humaine d'experts
- Spécifiquement supérieur pour raisonnement juridique, business et documents scientifiques
- Extended Thinking optimal pour chaînes logiques complexes (compliance multi-textes)
- Aucune nouvelle clé API nécessaire

**UX d'activation :**
```
Utilisateur clique sur 🧠 Réflexion
    → Message indicateur : "Mode Réflexion approfondie activé — la réponse prendra 30s à 2min"
    → Animation "Réflexion en cours..." avec compteur
    → Sortie : réponse structurée avec :
        * Analyse détaillée multi-angles
        * Identification des risques / angles morts
        * Recommandations actionnables pour l'administrateur
```

**Optionnel (phase 2) :**
Afficher dans un panneau replié la "chaîne de pensée" (extended_thinking) du modèle, pour transparence et auditabilité des raisonnements critiques (utile en cas de contestation future).

**Grille administrateur intégrée (system prompt spécifique) :**
Quand le mode Réflexion est activé, enrichir systématiquement l'analyse avec 5 filtres :
1. Risques juridiques (responsabilité administrateurs, conformité, litiges)
2. Risques financiers (cash, endettement, hors bilan, impairment)
3. Risques stratégiques (cohérence, dépendances, concurrence)
4. Risques de gouvernance (conflits d'intérêts, indépendance, parties liées)
5. Signaux faibles (omissions, optimismes suspects, ce qui n'est pas dit)

#### 3.3.4 Critères d'acceptation
- [ ] Une question juridique complexe (2+ textes à croiser) produit une analyse structurée couvrant les 5 filtres
- [ ] Réponse livre explicitement les "questions à poser en séance" (minimum 5)
- [ ] Réponse identifie au moins 3 zones d'ombre ou angles morts
- [ ] Latence acceptable (30s à 2min pour questions complexes)
- [ ] Coût maîtrisé : budget_tokens plafonné à 16K par défaut (override possible)

---

### 3.4 📝 BOUTON CANVAS — Édition Collaborative

#### 3.4.1 État actuel
Le chatbot produit des réponses textuelles dans le fil de conversation. Aucun espace d'édition dédié.

#### 3.4.2 Besoin
Après avoir analysé (lecture documents) et réfléchi (Réflexion) et recherché (Recherche), l'administrateur doit **produire un livrable personnel** : note de préparation, liste de questions pour la séance, projet de résolution alternatif, note de position motivée, etc.

Le Canvas offre un **espace d'édition côte à côte** avec le chat : document à gauche (éditable), conversation IA à droite pour itérer.

#### 3.4.3 Spécifications techniques

**Modèle par défaut :** `claude-sonnet-4-6` (latence faible pour édition rapide)
**Modèle upgradable :** `claude-opus-4-6` (bouton "Mode Opus" dans le Canvas) pour rédactions juridiques critiques

**Justification du choix :**
- Claude leader en prose naturelle + output 128K tokens en un passage
- Sonnet 4.6 : latence optimale pour itérations rapides
- Opus 4.6 : qualité maximale pour textes formels (résolutions, notes de position)
- Même clé API que le reste du stack Anthropic

**Templates préformatés (sélecteur au lancement du Canvas) :**

| Template | Usage | Modèle recommandé |
|----------|-------|-------------------|
| **Brief administrateur** | Note perso de 2 pages pour préparer la séance | Sonnet 4.6 |
| **Questions pour la séance** | Liste structurée par point d'ODJ | Sonnet 4.6 |
| **Projet de résolution** | Format juridique standard | Opus 4.6 |
| **Note de position** | Désaccord / abstention motivée (responsabilité administrateur) | Opus 4.6 |
| **Synthèse post-board** | Archive personnelle | Sonnet 4.6 |
| **Vierge** | Format libre | Sonnet 4.6 |

**Fonctionnalités Canvas requises :**
- Édition directe du texte par l'utilisateur (wysiwyg ou markdown)
- Commandes IA ciblées via sélection + prompt :
  - "Reformule ce paragraphe de manière plus juridique"
  - "Ajoute un argument s'appuyant sur l'article L225-38 du Code de commerce"
  - "Raccourcis cette section à 3 lignes"
- Historique des versions (undo/redo + snapshots nommés)
- Export :
  - PDF (format administrateur propre)
  - DOCX (pour édition ultérieure)
  - Markdown (pour archivage plain text)
- Sauvegarde automatique dans l'espace utilisateur

#### 3.4.4 Critères d'acceptation
- [ ] Interface 2 colonnes (document | chat) fluide sur desktop
- [ ] Commande IA sur sélection de texte < 5 secondes
- [ ] Export PDF avec mise en page propre (en-tête, pagination, date)
- [ ] Templates chargeables en 1 clic
- [ ] Historique des versions consultable
- [ ] Sauvegarde automatique toutes les 30 secondes

---

## 4. ARCHITECTURE TECHNIQUE

### 4.1 Stack global

```
┌──────────────────────────────────────────────────────────┐
│                    FRONTEND (UI)                          │
│  - Interface chat existante                               │
│  - 4 boutons d'action (refactorés)                        │
│  - Canvas (nouveau composant 2-colonnes)                  │
└─────────────────┬────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────┐
│              BACKEND — Router intelligent                 │
│  Détection du contexte + routing vers le bon modèle      │
└─┬──────────────┬──────────────┬──────────────┬──────────┘
  │              │              │              │
  ▼              ▼              ▼              ▼
┌───────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────┐
│  Gemini   │ │ Perplexity│ │   Claude     │ │  Claude  │
│  3.1 Pro  │ │   Sonar   │ │  Opus 4.6    │ │Sonnet 4.6│
│  (Vision) │ │Deep Rsrch │ │  (Thinking)  │ │ (Socle + │
│           │ │           │ │              │ │  Canvas) │
└───────────┘ └───────────┘ └──────────────┘ └──────────┘
       │            │              │              │
       └────────────┴──────────────┴──────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Databroker (socle)  │
              │  Légifrance / Pappers│
              │  FMP / FRED / News   │
              └──────────────────────┘
```

### 4.2 Variables d'environnement requises
```bash
# Existantes
ANTHROPIC_API_KEY=sk-ant-...

# À ajouter
GOOGLE_AI_API_KEY=...             # Pour Gemini 3.1 Pro
PERPLEXITY_API_KEY=pplx-...       # Pour Sonar Deep Research

# Databrokers existants
PAPPERS_API_KEY=...
FMP_API_KEY=...
FRED_API_KEY=...
TAVILY_API_KEY=...
NEWS_API_KEY=...
BRAVE_SEARCH_API_KEY=...
LEGIFRANCE_API_KEY=...
```

### 4.3 Structure de fichiers suggérée (à adapter au code existant)
```
src/
├── routers/
│   ├── button_router.py          # Détecte le bouton activé et route
│   └── fallback_handler.py       # Gestion des erreurs API
├── models/
│   ├── anthropic_client.py       # Claude Sonnet + Opus
│   ├── gemini_client.py          # Gemini 3.1 Pro (nouveau)
│   └── perplexity_client.py      # Sonar Deep Research (nouveau)
├── features/
│   ├── attachment/               # Logique pièce jointe étendue
│   │   ├── vision_handler.py     # Routing vers Gemini si image
│   │   └── file_parser.py        # Parser existant
│   ├── research/                 # Logique Deep Research
│   │   └── sonar_handler.py      # Appel Perplexity
│   ├── reasoning/                # Logique Réflexion
│   │   ├── extended_thinking.py  # Appel Opus + extended_thinking
│   │   └── admin_grid_prompt.py  # System prompt grille administrateur
│   └── canvas/                   # Nouvelle feature Canvas
│       ├── templates/            # Templates Markdown préformatés
│       │   ├── brief_admin.md
│       │   ├── questions_seance.md
│       │   ├── resolution.md
│       │   ├── note_position.md
│       │   └── synthese_post_board.md
│       ├── canvas_editor.py
│       ├── version_manager.py
│       └── export_handler.py     # PDF / DOCX / MD
├── databroker/                   # Existant
└── frontend/
    ├── components/
    │   ├── ChatInterface.tsx     # Existant
    │   ├── ButtonBar.tsx         # Refactor des 4 boutons
    │   ├── CanvasLayout.tsx      # Nouveau : 2 colonnes
    │   └── ResearchReport.tsx    # Affichage rapport Deep Research
```

### 4.4 Logique de routing (pseudo-code)
```python
def route_request(user_message, active_button, attached_files):
    # 1. Extraction du contexte
    context = extract_context(user_message, attached_files)

    # 2. Routing selon bouton actif
    if active_button == "attachment" and has_images(attached_files):
        # Vision : appel Gemini pour extraction
        visual_content = gemini_vision_extract(attached_files)
        return sonnet_process(user_message, visual_content + context)

    elif active_button == "search":
        # Deep Research : appel Perplexity
        databroker_results = run_databroker(user_message)  # parallèle
        sonar_report = perplexity_deep_research(user_message)
        return synthesize(databroker_results, sonar_report)

    elif active_button == "reasoning":
        # Extended Thinking : appel Opus avec grille administrateur
        return opus_extended_thinking(user_message, context, admin_grid_prompt)

    elif active_button == "canvas":
        # Édition : Sonnet par défaut, Opus sur demande
        model = "opus" if user_requested_opus else "sonnet"
        return canvas_edit(user_message, current_document, model)

    else:
        # Pas de bouton actif : comportement socle
        return sonnet_process(user_message, context)
```

---

## 5. PLAN DE DÉVELOPPEMENT SUGGÉRÉ

### Phase 1 — Fondations (Sprint 1, ~1 semaine)
1. Intégration Gemini 3.1 Pro API + tests vision
2. Refactor du handler pièce jointe avec routing vision/texte
3. Intégration Perplexity Sonar Deep Research API + tests
4. Activation `extended_thinking` sur Claude Opus 4.6

### Phase 2 — Features (Sprint 2, ~1-2 semaines)
5. UX bouton Recherche (barre de progression, affichage rapport sourcé)
6. UX bouton Réflexion (indicateur, grille administrateur)
7. Système de fallback inter-modèles
8. Monitoring coûts et quotas par utilisateur

### Phase 3 — Canvas (Sprint 3, ~2 semaines)
9. Composant Canvas UI (2 colonnes)
10. Implémentation des 6 templates
11. Édition sur sélection + commandes IA
12. Système de versioning
13. Export PDF / DOCX / MD

### Phase 4 — Finitions (Sprint 4, ~1 semaine)
14. Tests utilisateurs réels (5-10 administrateurs)
15. Optimisation performance
16. Documentation utilisateur
17. Mise en production

---

## 6. BUDGET & COÛTS

### 6.1 Coûts API mensuels estimés (100 utilisateurs actifs)

| Service | Volume estimé | Coût mensuel |
|---------|---------------|--------------|
| Claude Sonnet 4.6 (socle + Canvas) | ~50M tokens | $200-400 |
| Claude Opus 4.6 (Réflexion) | ~5M tokens | $200-400 |
| Gemini 3.1 Pro (Vision) | ~20M tokens | $50-150 |
| Perplexity Sonar Deep Research | ~300 requêtes | $100-300 |
| **TOTAL** | | **$550-1250/mois** |

### 6.2 Recommandations de contrôle de coûts
- Quota Deep Research par utilisateur (ex : 20/mois) avec alerte dépassement
- Cache des résultats databroker (TTL 24h) pour éviter appels redondants
- Budget `thinking` d'Opus plafonné à 16K tokens par défaut
- Monitoring temps réel par utilisateur avec alertes seuils

---

## 7. CRITÈRES DE SUCCÈS GLOBAUX

- [ ] Les 4 boutons apportent une **valeur ajoutée mesurable** par rapport au socle
- [ ] Temps de réponse acceptable : socle < 5s, Deep Research < 5min, Réflexion < 2min
- [ ] Taux de satisfaction administrateurs : > 85% (enquête post-utilisation)
- [ ] Coût par utilisateur actif : < $15/mois
- [ ] Zéro régression sur les fonctionnalités existantes
- [ ] Traçabilité complète des sources (conformité gouvernance)

---

## 8. POINTS À VALIDER AVANT DÉMARRAGE CODE

Questions ouvertes à clôturer avec l'équipe produit :

1. **Frontend framework** : quel framework UI est actuellement utilisé ? (React / Vue / autre) — le Canvas nécessitera un composant 2-colonnes conséquent
2. **Persistance Canvas** : où stocker les documents Canvas utilisateurs ? (DB existante ? S3 ? localStorage temporaire ?)
3. **Gestion multi-utilisateurs** : un administrateur peut-il partager un Canvas avec d'autres membres du board ?
4. **Stockage des rapports Deep Research** : historique consultable par l'utilisateur ?
5. **Branding des exports PDF** : logo Board Advisor ? Personnalisation par entreprise cliente ?
6. **Limites de rate** : définir précisément les quotas par utilisateur et par plan tarifaire
7. **Mode offline** : les documents uploadés doivent-ils être traitables sans appel API externe en secours ?

---

**Fin du CDC.**
Ce document constitue la base de référence pour le développement. Toute modification doit être validée et versionnée.
