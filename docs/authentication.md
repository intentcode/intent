# Authentication / Authentification

## English

### Overview

Intent uses GitHub OAuth to authenticate users. This allows users to access their private repositories without sharing their credentials with Intent.

### How It Works

```
┌─────────────┐     1. Click "Login with GitHub"      ┌─────────────┐
│   Frontend  │ ──────────────────────────────────▶   │   /api/auth │
│   (React)   │                                       │   /github   │
└─────────────┘                                       └──────┬──────┘
                                                             │
                                                             │ 2. Redirect to GitHub
                                                             ▼
                                                      ┌─────────────┐
                                                      │   GitHub    │
                                                      │   Login     │
                                                      └──────┬──────┘
                                                             │
                                                             │ 3. User authorizes
                                                             ▼
┌─────────────┐     5. Set JWT cookie + redirect      ┌─────────────┐
│   Frontend  │ ◀──────────────────────────────────   │   /api/auth │
│   (React)   │                                       │   /callback │
└─────────────┘                                       └──────┬──────┘
                                                             │
                                                             │ 4. Exchange code for token
                                                             ▼
                                                      ┌─────────────┐
                                                      │   GitHub    │
                                                      │   API       │
                                                      └─────────────┘
```

### Authentication Flow

1. **User clicks "Login with GitHub"** - The frontend redirects to `/api/auth/github`
2. **Redirect to GitHub** - The API redirects to GitHub's OAuth authorization page
3. **User authorizes** - The user grants permission to access their repositories
4. **Code exchange** - GitHub redirects back with a code, which we exchange for an access token
5. **JWT creation** - We create a JWT containing user info and the GitHub token, stored in an httpOnly cookie
6. **Authenticated requests** - All subsequent API calls include the cookie, allowing access to private repos

### Security

- **Stateless** - No server-side session storage required
- **httpOnly cookie** - The JWT cannot be accessed by JavaScript, preventing XSS attacks
- **GitHub token** - Stored encrypted in the JWT, used only for GitHub API calls
- **No credentials stored** - We never see or store the user's GitHub password

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/github` | GET | Initiates OAuth flow, redirects to GitHub |
| `/api/auth/callback` | GET | Handles GitHub callback, sets JWT cookie |
| `/api/auth/me` | GET | Returns current user info (or 401 if not logged in) |
| `/api/auth/logout` | POST | Clears the auth cookie |

### Required Scopes

- `repo` - Full access to private and public repositories
- `read:user` - Read user profile information

---

## Français

### Vue d'ensemble

Intent utilise GitHub OAuth pour authentifier les utilisateurs. Cela permet aux utilisateurs d'accéder à leurs dépôts privés sans partager leurs identifiants avec Intent.

### Comment ça fonctionne

```
┌─────────────┐     1. Clic "Login with GitHub"       ┌─────────────┐
│   Frontend  │ ──────────────────────────────────▶   │   /api/auth │
│   (React)   │                                       │   /github   │
└─────────────┘                                       └──────┬──────┘
                                                             │
                                                             │ 2. Redirection vers GitHub
                                                             ▼
                                                      ┌─────────────┐
                                                      │   GitHub    │
                                                      │   Login     │
                                                      └──────┬──────┘
                                                             │
                                                             │ 3. L'utilisateur autorise
                                                             ▼
┌─────────────┐     5. Cookie JWT + redirection       ┌─────────────┐
│   Frontend  │ ◀──────────────────────────────────   │   /api/auth │
│   (React)   │                                       │   /callback │
└─────────────┘                                       └──────┬──────┘
                                                             │
                                                             │ 4. Échange du code
                                                             ▼
                                                      ┌─────────────┐
                                                      │   GitHub    │
                                                      │   API       │
                                                      └─────────────┘
```

### Flux d'authentification

1. **L'utilisateur clique "Login with GitHub"** - Le frontend redirige vers `/api/auth/github`
2. **Redirection vers GitHub** - L'API redirige vers la page d'autorisation OAuth de GitHub
3. **L'utilisateur autorise** - L'utilisateur accorde la permission d'accéder à ses dépôts
4. **Échange du code** - GitHub redirige avec un code, qu'on échange contre un access token
5. **Création du JWT** - On crée un JWT contenant les infos utilisateur et le token GitHub, stocké dans un cookie httpOnly
6. **Requêtes authentifiées** - Tous les appels API suivants incluent le cookie, permettant l'accès aux repos privés

### Sécurité

- **Stateless** - Pas de stockage de session côté serveur
- **Cookie httpOnly** - Le JWT ne peut pas être lu par JavaScript, empêchant les attaques XSS
- **Token GitHub** - Stocké chiffré dans le JWT, utilisé uniquement pour les appels API GitHub
- **Aucun identifiant stocké** - On ne voit et ne stocke jamais le mot de passe GitHub de l'utilisateur

### Endpoints API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/auth/github` | GET | Initie le flux OAuth, redirige vers GitHub |
| `/api/auth/callback` | GET | Gère le callback GitHub, définit le cookie JWT |
| `/api/auth/me` | GET | Retourne les infos de l'utilisateur (ou 401 si non connecté) |
| `/api/auth/logout` | POST | Supprime le cookie d'authentification |

### Scopes requis

- `repo` - Accès complet aux dépôts privés et publics
- `read:user` - Lecture des informations du profil utilisateur

---

## Setup / Configuration

### GitHub OAuth App

**Production app:** https://github.com/settings/applications/3342234

### 1. Create GitHub OAuth App / Créer l'app OAuth GitHub

Go to / Aller sur : https://github.com/settings/developers → **New OAuth App**

```
Application name: Intent
Homepage URL: https://your-domain.vercel.app
Authorization callback URL: https://your-domain.vercel.app/api/auth/callback
```

### 2. Environment Variables / Variables d'environnement

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
JWT_SECRET=your_random_32_byte_hex_string
```

### 3. Generate JWT Secret / Générer le secret JWT

```bash
openssl rand -hex 32
```
