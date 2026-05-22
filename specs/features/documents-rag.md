# Feature : Gestion Documentaire et RAG

> Derniere mise a jour : 21 mars 2026

---

## Description

Pipeline complet d'ingestion de documents avec extraction de texte, chunking, generation d'embeddings, et recherche semantique via pgvector. Le tout scope par board (RLS).

---

## Formats supportes

| Format | Librairie d'extraction |
|--------|----------------------|
| PDF | pdf-parse |
| DOCX | mammoth |
| XLSX | xlsx |
| TXT | lecture directe |
| Markdown | lecture directe |

---

## Pipeline d'ingestion

1. **Upload** via `/api/rag/process` (FormData : `file` + `board_id`)
2. **Extraction de texte** : `extractText()` detecte le format et extrait le contenu
3. **Chunking** : `chunkText()` decoupe en segments de 2000 caracteres avec chevauchement de 300, detection de sections (titres, chapitres)
4. **Embeddings** : `generateEmbeddings()` via Voyage 4 (vecteurs 1024 dimensions)
5. **Stockage** : chaque chunk est insere dans `document_chunks` avec son embedding
6. **Statut** : le document passe de `uploaded` a `indexed`

---

## Pipeline de recherche

1. **Requete** via `/api/rag/search` (JSON : `query`, `board?`, `matchCount?`)
2. **Embedding de la requete** : la question est convertie en vecteur Voyage 4
3. **Recherche pgvector** : RPC `match_documents()` — similarite cosinus, seuil 0.5
4. **Reranking** : Claude Haiku attribue un score de pertinence 0-10 a chaque chunk
5. **Filtrage** : garde uniquement les scores >= 6, top 4 resultats
6. **Retour** : chunks avec document_name, content, section_title, similarity score

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/extract-text.ts` | Extraction de texte multi-format |
| `src/lib/rag.ts` | Chunking + embeddings + reranking |
| `src/app/api/rag/process/route.ts` | Route upload + indexation |
| `src/app/api/rag/search/route.ts` | Route recherche semantique |
| `src/app/api/documents/route.ts` | Route liste des documents |
| `src/app/dashboard/documents/page.tsx` | Page documents |
| `src/components/chat/document-picker.tsx` | Selecteur de documents pour le chat |

---

## Tables concernees

- `documents` — Metadata (nom, type, taille, board_id, status)
- `document_chunks` — Chunks avec embedding vector(1024)

---

## RPC

- `match_documents(query_embedding, match_count, match_threshold, filter_board_id, filter_document_ids, filter_user_id)` — Recherche semantique board-scoped

---

## Parametres de configuration

| Parametre | Valeur |
|-----------|--------|
| Taille chunk | 2000 caracteres |
| Chevauchement | 300 caracteres |
| Modele embedding | Voyage 4 (1024 dim) |
| Seuil similarite | 0.5 |
| Seuil reranking | 6/10 |
| Max resultats | 4 (apres reranking) |
