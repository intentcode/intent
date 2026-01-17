---
id: "010"
from: HEAD
author: claude
date: 2025-01-17
status: active
risk: medium
tags: [feature, auth, security, vercel]
files:
  - api/auth/github.ts
  - api/auth/callback.ts
  - api/auth/me.ts
  - api/auth/logout.ts
  - api/_lib/github.ts
  - api/github-pr.ts
  - src/lib/auth.ts
  - src/App.tsx
  - src/App.css
  - docs/authentication.md
---

# GitHub OAuth Authentication
# fr: Authentification GitHub OAuth

## Summary
en: Implements GitHub OAuth authentication to allow users to access private repositories. Uses JWT stored in httpOnly cookies for stateless session management. The GitHub access token is embedded in the JWT and used for API calls to GitHub.
fr: Implémente l'authentification GitHub OAuth pour permettre aux utilisateurs d'accéder aux dépôts privés. Utilise des JWT stockés dans des cookies httpOnly pour une gestion de session stateless. Le token d'accès GitHub est intégré dans le JWT et utilisé pour les appels API vers GitHub.

## Motivation
en: Private repositories require authentication. By using GitHub OAuth, users can securely access their private repos without sharing credentials with Intent. This is essential for the product to be useful in professional/enterprise contexts.
fr: Les dépôts privés nécessitent une authentification. En utilisant GitHub OAuth, les utilisateurs peuvent accéder de manière sécurisée à leurs repos privés sans partager leurs identifiants avec Intent. C'est essentiel pour que le produit soit utile en contexte professionnel/entreprise.

## Chunks

### @file:api/auth/github.ts | OAuth Initiation Endpoint
### fr: Point d'entrée OAuth
en: Redirects users to GitHub's authorization page. Stores the redirect URL in the state parameter to return users to their original page after authentication.
fr: Redirige les utilisateurs vers la page d'autorisation GitHub. Stocke l'URL de redirection dans le paramètre state pour ramener les utilisateurs à leur page d'origine après authentification.

> Decision: Use state parameter for redirect URL to maintain navigation context
> fr: Utiliser le paramètre state pour l'URL de redirection afin de maintenir le contexte de navigation

### @file:api/auth/callback.ts | OAuth Callback Handler
### fr: Gestionnaire de callback OAuth
en: Handles the callback from GitHub after user authorization. Exchanges the authorization code for an access token, fetches user info, creates a JWT containing both user info and the GitHub token, and sets it as an httpOnly cookie.
fr: Gère le callback de GitHub après l'autorisation de l'utilisateur. Échange le code d'autorisation contre un token d'accès, récupère les infos utilisateur, crée un JWT contenant les infos utilisateur et le token GitHub, et le définit comme cookie httpOnly.

> Decision: Store GitHub token in JWT rather than server-side session for stateless architecture
> fr: Stocker le token GitHub dans le JWT plutôt qu'une session serveur pour une architecture stateless

> Decision: Use 7-day JWT expiration as a balance between security and UX
> fr: Utiliser une expiration JWT de 7 jours comme compromis entre sécurité et UX

### @file:api/_lib/github.ts | Shared Auth Utilities
### fr: Utilitaires d'authentification partagés
en: Shared functions for extracting auth info from requests and generating GitHub API headers. Used by all API endpoints that need to make authenticated GitHub calls.
fr: Fonctions partagées pour extraire les infos d'auth des requêtes et générer les headers API GitHub. Utilisé par tous les endpoints API qui doivent faire des appels GitHub authentifiés.

> Decision: Extract auth logic into shared lib for DRY code across Vercel functions
> fr: Extraire la logique d'auth dans une lib partagée pour un code DRY entre les fonctions Vercel

### @pattern:user-menu | User Menu UI Component
### fr: Composant UI Menu Utilisateur
en: Displays login button when not authenticated, or user avatar with logout option when authenticated. Placed in the app header for consistent access.
fr: Affiche le bouton de connexion quand non authentifié, ou l'avatar utilisateur avec option de déconnexion quand authentifié. Placé dans le header de l'app pour un accès constant.

> Decision: Use green login button to match GitHub branding and indicate primary action
> fr: Utiliser un bouton de connexion vert pour correspondre au branding GitHub et indiquer l'action principale

---
