# Feature : Memoire Institutionnelle

> Derniere mise a jour : 21 mars 2026
> Migration : 011_preparation_memory.sql

---

## Description

Systeme de persistance des connaissances issues des reunions de conseil : decisions, actions, engagements verbaux et sujets traites. Permet de suivre l'historique des decisions et la responsabilite des membres.

---

## 4 types de donnees

### Decisions (`board_decisions`)

Decisions prises en reunion (votes, deliberations).

| Champ | Description |
|-------|-------------|
| subject | Sujet de la decision |
| description | Details |
| vote_result | approved, rejected, deferred, unanimous, majority |
| status | active, superseded (remplacee), revoked (annulee) |
| meeting_id | Reunion ou la decision a ete prise |
| created_by | Qui a enregistre la decision |

### Actions (`board_actions`)

Actions a realiser suite aux decisions.

| Champ | Description |
|-------|-------------|
| description | Ce qui doit etre fait |
| assignee_id / assignee_name | Qui doit le faire |
| deadline | Date limite |
| status | todo, in_progress, done, overdue, cancelled |
| priority | low, medium, high, critical |
| decision_id | Decision associee (optionnel) |
| meeting_id | Reunion d'origine |
| notes | Notes additionnelles |
| completed_at | Date de completion |

La fonction `mark_overdue_actions()` detecte automatiquement les actions en retard (status todo/in_progress + deadline passee).

### Engagements (`board_engagements`)

Promesses verbales faites en reunion.

| Champ | Description |
|-------|-------------|
| speaker_id / speaker_name | Qui a fait la promesse |
| description | Ce qui a ete promis |
| context | Contexte de la promesse |
| status | pending, fulfilled (tenu), broken (non tenu), expired |
| meeting_id | Reunion d'origine |

### Sujets traites (`board_subjects`)

Sujets abordes en reunion.

| Champ | Description |
|-------|-------------|
| title | Titre du sujet |
| summary | Resume de la discussion |
| duration_minutes | Duree de la discussion |
| status | discussed, deferred (reporte), resolved |
| decision_id | Decision associee (optionnel) |
| meeting_id | Reunion d'origine |

---

## Securite (RLS)

Toutes les tables suivent le pattern board-member-scoped :

| Operation | Qui peut |
|-----------|---------|
| SELECT | Tout membre du board |
| INSERT | Tout membre du board |
| UPDATE | Admin/Owner du board (sauf board_actions : l'assignee peut aussi modifier) |
| DELETE | Admin/Owner du board (decisions et actions uniquement) |

---

## Relations

```
board_decisions ←──── board_actions (decision_id)
board_decisions ←──── board_subjects (decision_id)
meetings ←──── board_decisions (meeting_id)
meetings ←──── board_actions (meeting_id)
meetings ←──── board_engagements (meeting_id)
meetings ←──── board_subjects (meeting_id)
boards ←──── toutes les tables (board_id)
```

---

## Fichiers cles

Les tables sont creees dans la migration `011_preparation_memory.sql`. Les routes API et l'interface frontend pour cette feature n'ont pas encore ete implementes.

---

## A implementer

- Routes API CRUD pour decisions, actions, engagements, sujets
- Interface frontend pour visualiser et gerer la memoire institutionnelle
- Integration avec le live : extraction automatique des decisions/engagements depuis les transcriptions
- Dashboard de suivi des actions (filtres par statut, assignee, deadline)
- Cron ou trigger pour `mark_overdue_actions()` (execution periodique)
