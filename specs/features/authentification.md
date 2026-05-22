# Feature : Authentification

> Derniere mise a jour : 21 mars 2026

---

## Description

Systeme d'authentification complet via Supabase Auth avec Google OAuth et email/mot de passe. Protection des routes par middleware. Creation automatique de profil a l'inscription.

---

## Methodes de connexion

### Google OAuth
1. L'utilisateur clique "Continuer avec Google" sur `/login`
2. Supabase redirige vers Google consent screen
3. Google renvoie vers `/auth/callback` avec un code
4. Le callback echange le code pour une session (`exchangeCodeForSession`)
5. Redirect vers `/dashboard` (ou la page demandee via param `next`)

### Email / Mot de passe
- **Inscription** : `signUp()` avec email, password, full_name
- **Connexion** : `signInWithPassword()` avec email, password
- **Mot de passe oublie** : `resetPasswordForEmail()` → email avec lien de reinitialisation

---

## Protection des routes

Le middleware (`src/middleware.ts`) intercepte les requetes vers :
- `/dashboard/*` → redirige vers `/login` si non authentifie
- `/invite/*` → redirige vers `/login?next=/invite/...` (preserve la destination)

Apres login, le parametre `next` est lu pour rediriger vers la page d'origine.

---

## Auto-creation de profil

Trigger PostgreSQL `handle_new_user()` sur `auth.users` INSERT :
- Cree une ligne dans `profiles` avec id, email, full_name, avatar_url
- full_name extrait de `raw_user_meta_data` (Google: `name`, email: `full_name`)
- avatar_url extrait de `raw_user_meta_data` (Google: `picture`)

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/app/login/page.tsx` | Page login/register/forgot (3 onglets) |
| `src/app/auth/callback/route.ts` | Echange code OAuth → session |
| `src/middleware.ts` | Protection des routes protegees |
| `src/lib/supabase.ts` | Client Supabase client-side |
| `src/lib/supabase-server.ts` | Client Supabase server-side + `getAuthenticatedUser()` |

---

## Tables concernees

- `profiles` — Profils utilisateurs (trigger auto-creation)

---

## Limitations

- La verification d'email necessite Resend avec domaine verifie (pas encore configure)
- Les avatars ne sont remplis que pour les comptes Google OAuth
