# Board Advisor — Limitations Connues

> Derniere mise a jour : 21 mars 2026

---

## Fonctionnelles

### Emails non fonctionnels
**Probleme** : Resend necessite un nom de domaine verifie pour envoyer des emails.
**Impact** : Les invitations par email (board + reunion) et la verification d'email ne fonctionnent pas tant qu'un domaine n'est pas configure dans Resend.
**Workaround** : Les invitations sont creees en base mais l'email n'est pas envoye. L'utilisateur invite doit recevoir le lien manuellement.

### Avatars limites
**Probleme** : Seuls les utilisateurs connectes via Google OAuth ont un `avatar_url` rempli.
**Impact** : Les comptes email/password affichent un placeholder au lieu d'un avatar.
**Workaround** : Aucun pour le moment. Possibilite future : upload d'avatar manuel.

### Statut des reunions
**Probleme** : Pas de transition automatique de `idle` vers `completed` quand la date planifiee passe.
**Impact** : Les reunions passees restent en statut `idle` en base.
**Workaround** : Le frontend utilise une comparaison de `scheduled_at` avec la date actuelle pour la logique d'affichage (filtres "A venir" vs "Terminees").

### Legifrance PISTE
**Probleme** : L'API Legifrance PISTE retourne actuellement des erreurs 403.
**Impact** : L'outil `check_legal` du chatbot ne peut pas acceder aux textes de loi directement.
**Workaround** : Fallback configure vers Brave Search pour les recherches juridiques.

---

## Techniques

### PostgREST join limitation
**Probleme** : `meeting_participants.user_id` a une FK vers `auth.users(id)`, pas vers `profiles(id)`. PostgREST ne peut pas faire de join automatique vers profiles.
**Impact** : Impossible de recuperer les profils des participants en une seule requete.
**Workaround** : 2 requetes separees (participants + profiles par user_ids) puis merge cote API route.

### Webhook Recall.ai en developpement
**Probleme** : Recall.ai doit pouvoir atteindre `/api/live/webhook` via une URL publique.
**Impact** : En developpement local, les webhooks ne fonctionnent pas sans tunnel.
**Workaround** : Utiliser ngrok ou un service similaire pour exposer localhost.

### Pas de tests automatises
**Probleme** : Aucun framework de test n'est configure (ni Jest, ni Playwright, ni Cypress).
**Impact** : Pas de tests unitaires, d'integration ou E2E.
**A faire** : Configurer un framework de test quand le produit sera plus stable.

---

## Securite

### Verification email
**Probleme** : La verification d'email par Supabase Auth necessite Resend avec un domaine verifie.
**Impact** : Les utilisateurs qui s'inscrivent par email/password ne passent pas par la verification d'email.
**Workaround** : Aucun tant que Resend n'est pas configure avec un domaine.

### Webhook sans signature
**Probleme** : Le webhook `/api/live/webhook` ne verifie pas actuellement de signature Recall.ai.
**Impact** : N'importe qui connaissant l'URL pourrait envoyer de faux webhooks.
**A faire** : Implementer la verification de signature si Recall.ai en fournit une.
