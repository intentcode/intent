---
id: "014"
from: HEAD
author: claude
date: 2025-01-18
status: active
risk: medium
tags: [feature, auth, github-app, private-repos]
files:
  - server/index.ts
  - src/lib/api.ts
  - src/App.tsx
  - src/App.css
  - env.example
---

# GitHub App Authentication
# fr: Authentification via GitHub App

## Summary
en: Replaces OAuth App with GitHub App for private repository access. GitHub Apps provide granular read-only permissions instead of full repo scope, and work with organizations that have OAuth App restrictions enabled.
fr: Remplace l'OAuth App par une GitHub App pour l'accès aux dépôts privés. Les GitHub Apps offrent des permissions granulaires en lecture seule au lieu du scope repo complet, et fonctionnent avec les organisations ayant des restrictions OAuth activées.

## Motivation
en: Organizations like Wooclap have OAuth App access restrictions enabled, blocking third-party OAuth Apps from accessing their repositories. GitHub Apps bypass these restrictions because they are explicitly installed by org admins with specific permissions. This also improves security by requesting only read-only access.
fr: Des organisations comme Wooclap ont des restrictions d'accès OAuth activées, bloquant les OAuth Apps tierces. Les GitHub Apps contournent ces restrictions car elles sont explicitement installées par les admins avec des permissions spécifiques. Cela améliore aussi la sécurité en ne demandant qu'un accès en lecture.

## Chunks

### @function:generateAppJWT | App JWT Generation
### fr: Génération du JWT de l'App
en: Creates a JWT signed with the GitHub App's private key to authenticate as the app itself. This JWT is used to request installation tokens. Uses Node.js crypto for PKCS#1 key format support.
fr: Crée un JWT signé avec la clé privée de l'App GitHub pour s'authentifier en tant qu'app. Ce JWT est utilisé pour demander des tokens d'installation. Utilise Node.js crypto pour le support du format PKCS#1.

> Decision: Use Node.js crypto.createPrivateKey instead of jose.importPKCS8 because GitHub generates keys in PKCS#1 format
> fr: Utiliser crypto.createPrivateKey au lieu de jose.importPKCS8 car GitHub génère des clés en format PKCS#1

### @function:getInstallationId | Installation ID Lookup
### fr: Recherche de l'ID d'installation
en: Queries the GitHub API to check if the Intent app is installed on a specific repository. Returns the installation ID if found, null otherwise.
fr: Interroge l'API GitHub pour vérifier si l'app Intent est installée sur un dépôt spécifique. Retourne l'ID d'installation si trouvé, null sinon.

### @function:getInstallationToken | Installation Token Generation
### fr: Génération du token d'installation
en: Exchanges an installation ID for a short-lived access token that can read repository contents. Implements caching to avoid unnecessary API calls (tokens valid for 55 minutes).
fr: Échange un ID d'installation contre un token d'accès temporaire pour lire le contenu des dépôts. Implémente un cache pour éviter les appels API inutiles (tokens valides 55 minutes).

> Decision: Cache tokens for 55 minutes (GitHub tokens expire after 1 hour)
> fr: Cache les tokens pendant 55 minutes (les tokens GitHub expirent après 1 heure)

### @function:getRepoAccessToken | Token Selection Logic
### fr: Logique de sélection du token
en: Determines the best token to use for API requests: installation token (preferred), user OAuth token (fallback), or server token (public repos). Returns both the token and its source for error handling.
fr: Détermine le meilleur token à utiliser: token d'installation (préféré), token OAuth utilisateur (fallback), ou token serveur (repos publics). Retourne le token et sa source pour la gestion d'erreurs.

> Decision: Prefer installation token over user token because it has read-only permissions
> fr: Préférer le token d'installation au token utilisateur car il a des permissions en lecture seule

### @class:AppNotInstalledError | Installation Error Type
### fr: Type d'erreur d'installation
en: Custom error class thrown when trying to access a private repo where the GitHub App is not installed. Includes the installation URL so the frontend can prompt the user.
fr: Classe d'erreur personnalisée levée lors de l'accès à un repo privé où l'App n'est pas installée. Inclut l'URL d'installation pour que le frontend puisse guider l'utilisateur.

### @pattern:install-required-banner | Installation Prompt UI
### fr: Interface de prompt d'installation
en: Beautiful purple-themed banner displayed when the GitHub App needs to be installed on an organization. Shows the org name in bold and provides a direct link to install the app on GitHub.
fr: Bannière violette affichée quand l'App doit être installée sur une organisation. Affiche le nom de l'org en gras et fournit un lien direct pour installer l'app sur GitHub.

> Decision: Use purple color scheme to differentiate from auth-required (blue) and error (red) banners
> fr: Utiliser un thème violet pour différencier de l'auth requise (bleu) et des erreurs (rouge)

---
