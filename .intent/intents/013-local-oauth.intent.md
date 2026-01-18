---
id: "013"
from: HEAD
author: claude
date: 2025-01-18
status: active
risk: low
tags: [feature, auth, local-dev, config]
files:
  - server/index.ts
  - src/lib/api.ts
  - src/lib/auth.ts
  - src/App.tsx
  - env.example
---

# Local Development OAuth Support
# fr: Support OAuth pour le développement local

## Summary
en: Adds OAuth authentication support to the local Express server, enabling private repository access during development. Also adds server-side configuration for default repo path and passes user OAuth tokens to all GitHub API calls.
fr: Ajoute le support d'authentification OAuth au serveur Express local, permettant l'accès aux dépôts privés pendant le développement. Ajoute également une configuration côté serveur pour le chemin de dépôt par défaut et transmet les tokens OAuth utilisateur à tous les appels API GitHub.

## Motivation
en: The Vercel production deployment had OAuth working, but local development couldn't access private repos. Developers need to test with private repositories during development. This also improves DX by allowing a default repo path to be configured.
fr: Le déploiement Vercel en production avait OAuth fonctionnel, mais le développement local ne pouvait pas accéder aux repos privés. Les développeurs ont besoin de tester avec des dépôts privés pendant le développement. Cela améliore aussi la DX en permettant de configurer un chemin de dépôt par défaut.

## Chunks

### @function:getAuthUser | JWT Session Helper
### fr: Helper de session JWT
en: Extracts user information and GitHub token from the JWT stored in the httpOnly cookie. Returns null if not authenticated. Used by all GitHub API routes to get the user's OAuth token.
fr: Extrait les informations utilisateur et le token GitHub du JWT stocké dans le cookie httpOnly. Retourne null si non authentifié. Utilisé par toutes les routes API GitHub pour obtenir le token OAuth de l'utilisateur.

> Decision: Reuse same JWT structure as Vercel functions for consistency
> fr: Réutiliser la même structure JWT que les fonctions Vercel pour la cohérence

### @pattern:GET /api/auth/github | OAuth Initiation Route
### fr: Route d'initiation OAuth
en: Redirects to GitHub OAuth authorization page with CSRF nonce protection. Stores nonce in cookie and state parameter. Requires GITHUB_CLIENT_ID environment variable.
fr: Redirige vers la page d'autorisation GitHub OAuth avec protection nonce CSRF. Stocke le nonce dans un cookie et le paramètre state. Nécessite la variable d'environnement GITHUB_CLIENT_ID.

### @pattern:GET /api/auth/callback | OAuth Callback Route
### fr: Route de callback OAuth
en: Handles GitHub OAuth callback, exchanges code for token, fetches user info, creates JWT with embedded GitHub token, and redirects to frontend. Validates CSRF nonce.
fr: Gère le callback OAuth GitHub, échange le code contre un token, récupère les infos utilisateur, crée un JWT avec le token GitHub intégré, et redirige vers le frontend. Valide le nonce CSRF.

> Decision: Redirect to localhost:5173 (frontend) after OAuth, not 3001 (backend)
> fr: Rediriger vers localhost:5173 (frontend) après OAuth, pas 3001 (backend)

### @pattern:GET /api/config | Configuration Endpoint
### fr: Endpoint de configuration
en: Returns frontend configuration including default repo path and OAuth availability. Allows frontend to adapt based on server capabilities.
fr: Retourne la configuration frontend incluant le chemin de dépôt par défaut et la disponibilité OAuth. Permet au frontend de s'adapter selon les capacités du serveur.

### @function:getGitHubHeaders | GitHub Headers Helper
### fr: Helper pour les headers GitHub
en: Updated to accept optional userToken parameter. Prefers user's OAuth token over server GITHUB_TOKEN for API calls, enabling private repo access.
fr: Mis à jour pour accepter un paramètre userToken optionnel. Préfère le token OAuth de l'utilisateur au GITHUB_TOKEN du serveur pour les appels API, permettant l'accès aux repos privés.

> Decision: Fallback to GITHUB_TOKEN if no user token - maintains public repo functionality without login
> fr: Fallback vers GITHUB_TOKEN si pas de token utilisateur - maintient la fonctionnalité des repos publics sans connexion

### @function:fetchConfig | Frontend Config Fetcher
### fr: Récupérateur de config frontend
en: New API function to fetch server configuration. Used on app mount to get default repo path and other settings.
fr: Nouvelle fonction API pour récupérer la configuration serveur. Utilisée au montage de l'app pour obtenir le chemin de dépôt par défaut et autres paramètres.

### @pattern:credentials: 'include' | Cross-Origin Credentials
### fr: Credentials cross-origin
en: Added credentials include to all GitHub API fetch calls in frontend. Required for cookies to be sent with cross-origin requests from localhost:5173 to localhost:3001.
fr: Ajout de credentials include à tous les appels fetch API GitHub dans le frontend. Nécessaire pour que les cookies soient envoyés avec les requêtes cross-origin de localhost:5173 vers localhost:3001.

> Decision: Add credentials to GitHub API calls only, not all API calls - only needed for auth-dependent endpoints
> fr: Ajouter credentials aux appels API GitHub uniquement, pas à tous les appels - nécessaire seulement pour les endpoints dépendant de l'auth

---
