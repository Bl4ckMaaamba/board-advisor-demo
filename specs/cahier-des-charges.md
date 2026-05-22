# Board Advisor — Cahier des Charges

> Derniere mise a jour : 21 mars 2026

---

## Vision

Board Advisor est une plateforme de gouvernance d'entreprise augmentee par l'IA. Elle accompagne les administrateurs de conseil d'administration dans la **preparation**, l'**animation** et la **documentation** des reunions de conseil.

**Cible** : Standards de gouvernance CAC 40, FTSE 100 et Fortune 500.
**Cadre reglementaire** : Code de commerce, AFEP-MEDEF, AMF, CSRD, Sapin II, RGPD.

---

## Modules

### 1. Authentification et multi-membres

- Google OAuth + email/mot de passe via Supabase Auth
- Reinitialisation de mot de passe par email
- Systeme de boards avec roles : **owner**, **admin**, **member**
- Invitations par email avec tokens a expiration (7 jours)
- Page d'acceptation d'invitation `/invite/board/[token]`
- Middleware de protection des routes `/dashboard/*` et `/invite/*`
- Creation automatique de profil a l'inscription (trigger PostgreSQL)
- RLS scopee par board : chaque utilisateur ne voit que ses boards

### 2. Gestion des boards

- Creation de boards (nom, description, secteur d'activite)
- Detail par board avec membres, documents, reunions
- Invitation de nouveaux membres avec choix du role
- Promotion/retrogradation avec confirmation
- Suppression de membres avec confirmation
- Filtrage global par board (contexte partage dans toute l'app)
- Profil sectoriel enrichi : SIREN, forme juridique, siege, taille, CA, effectifs, zones geo, cote/non-cote, contexte strategique
- Concurrents, clients cles, KPIs suivis

### 3. Gestion documentaire et RAG

- Upload : PDF, DOCX, XLSX, TXT, Markdown
- Extraction de texte automatique selon le format
- Chunking : segments de 2000 caracteres, chevauchement de 300, detection de sections
- Embeddings : Voyage 4 (vecteurs 1024 dimensions)
- Recherche semantique : pgvector (similarite cosinus, seuil 0.5)
- Reranking : Claude Haiku (score 0-10, filtre a 6+, top 4 resultats)
- Liste des documents avec filtrage par board et metadonnees

### 4. Chatbot IA agentique

Assistant IA specialise en gouvernance d'entreprise, construit sur Claude Sonnet avec tool use.

**Domaines d'expertise** :
- Droit des societes francais (Code de commerce, AFEP-MEDEF, AMF)
- Analyse financiere (ratios, valorisations, due diligence)
- Conformite et reglementation (CSRD, Sapin II, RGPD, devoir de vigilance)
- ESG et responsabilite (trajectoires climat, dialogue social, Say on Pay)

**7 outils integres** (execution parallele) :

| Outil | Fonction | Source |
|-------|----------|--------|
| `search_internal_documents` | Recherche semantique docs uploades | pgvector + Haiku reranking |
| `get_financial_data` | Donnees financieres | Financial Modeling Prep |
| `get_company_info` | Profils d'entreprises | Pappers (FR), OpenCorporates (intl) |
| `search_news` | Actualites et presse | Brave, Tavily, NewsAPI, Google News |
| `check_legal` | Textes de loi | Legifrance (PISTE) |
| `get_macro_indicators` | Indicateurs macro-economiques | FRED, World Bank |
| `sector_benchmark` | Comparaisons sectorielles | FMP |

**Fonctionnalites** :
- Streaming SSE en temps reel
- Historique des conversations (par board dans Supabase)
- Citations des sources (docs internes + APIs externes)
- Blocs riches : graphiques (bar, line, pie), KPIs avec tendances, callouts
- Indicateur d'activite des outils pendant la recherche
- Selecteur de documents pour restreindre le contexte
- Bouton d'arret fonctionnel (conserve le texte partiel)

### 5. Reunions — Page unifiee

Une seule page `/dashboard/meetings` avec 3 vues inline :

**Vue liste** :
- Filtres par statut : Toutes / A venir / En cours / Terminees
- Cartes avec badge de statut, indicateurs, compteurs

**Vue detail** :
- Informations (titre, description, date, heure)
- Gestion des participants : permanents (auto) + invites exceptionnels
- Affichage : avatar, nom, role, type (permanent/exceptionnel)
- Actions admin : promouvoir, supprimer, ajouter un invite
- Documents lies a la reunion
- Bouton "Preparer" → chatbot avec docs pre-selectionnes
- Bouton "Lancer en live" → session live (admin uniquement, jour J)

**Vue live** :
- Transcription en direct avec attribution des locuteurs
- Panel de fact-checking (affirmations + verdicts)
- Alertes de moderation (detection de ton)
- Suggestions (points d'action, questions)
- Statistiques par locuteur (temps de parole, nombre de mots)
- Indicateur de latence du pipeline
- Bouton d'arret

### 6. Systeme de reunions live

**Mode presentiel** :
- Streaming audio temps reel via Deepgram WebSocket
- Buffer de transcription avec scores de confiance
- Diarisation des locuteurs (optionnel)

**Mode visioconference** :
- Recall.ai : bot manage qui rejoint Zoom, Google Meet, Microsoft Teams
- Transcription : AssemblyAI via Recall.ai (detection multilingue automatique)
- Webhooks → normalisation → memes pipelines que le presentiel
- Chaque reunion a un `meeting_type` (in_person ou visio) + `meeting_url`
- Statut du bot en temps reel : joining → in_call → recording → done
- Cout : ~0.65EUR/h par reunion visio

**4 pipelines concurrents** (identiques pour les 2 modes) :

| Pipeline | Fonction |
|----------|----------|
| Claim Detection | Extraction des affirmations factuelles |
| Fact-Checking | Verification web + jugement IA (vrai/faux/partiel/inverifiable) |
| Moderation | Analyse de ton et sentiment, detection d'escalade |
| Suggestions | Points d'action, questions, recommandations |

Ecriture temps reel dans Supabase + Realtime broadcast vers le frontend.

### 7. Data Broker (Integration donnees externes)

Systeme a 5 couches pour router les requetes vers 10 fournisseurs :

| Couche | Fonction |
|--------|----------|
| Layer 1 — Ingress | Classification LLM (Haiku) + extraction d'entites |
| Layer 2 — Orchestration | Execution parallele, circuit breaker, controle des couts |
| Layer 3 — Providers | 10 APIs (Brave, Tavily, FMP, Pappers, Legifrance, FRED, World Bank, NewsAPI, Google News, OpenCorporates) |
| Layer 4 — Cache | 3 niveaux (L1 memoire LRU, L2 Upstash Redis, L3 Supabase PostgreSQL) |
| Layer 5 — Egress | Deduplication, detection de conflits, fusion |

**Controle des couts** : max 0.05EUR/requete, 50EUR/board/mois, 400EUR/mois global.

### 8. Memoire institutionnelle

Tables pour persister les connaissances issues des reunions :
- **Decisions** : sujet, description, resultat du vote, statut (active/superseded/revoked)
- **Actions** : description, assignee, deadline, statut, priorite
- **Engagements** : promesses verbales avec contexte et suivi
- **Sujets traites** : titre, resume, duree, statut (discussed/deferred/resolved)

Fonction automatique `mark_overdue_actions()` pour detecter les actions en retard.

### 9. Dashboard principal

- Vue d'ensemble avec invitations en attente, boards, documents recents
- Activite recente et statistiques
- Navigation rapide vers toutes les fonctionnalites

### 10. Gestion de compte

- Edition du profil (nom, email)
- Deconnexion
- Vue du compte utilisateur

---

## Edge Functions (Supabase/Deno)

| Fonction | Role |
|----------|------|
| `send-board-invitation` | Email d'invitation a un board via Resend |
| `send-meeting-invitation` | Email d'invitation a une reunion via Resend |
