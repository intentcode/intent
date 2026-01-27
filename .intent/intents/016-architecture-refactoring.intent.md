---
id: "016"
from: HEAD
author: claude
date: 2025-01-18
status: active
risk: medium
tags: [architecture, refactoring, performance, maintainability]
files:
  - src/styles/theme.css
  - src/hooks/useAuth.ts
  - src/hooks/usePRSwitcher.ts
  - src/hooks/useFileTree.ts
  - src/hooks/useScrollIndicator.ts
  - src/hooks/index.ts
  - src/components/common/PRSwitcher.tsx
  - src/components/common/ScrollIndicator.tsx
  - src/components/common/index.ts
  - server/services/tokenManager.ts
  - server/services/intentLoader.ts
  - src/App.css
---

# Architecture Refactoring - Modular Design System
# fr: Refactoring Architecture - Système de Design Modulaire

## Summary
en: Major refactoring to transform monolithic codebase into modular architecture. Introduces CSS design system with variables, extracts reusable React hooks for state management, creates common components to eliminate duplication, and establishes backend services for token and intent management.
fr: Refactoring majeur pour transformer le codebase monolithique en architecture modulaire. Introduit un système de design CSS avec variables, extrait des hooks React réutilisables pour la gestion d'état, crée des composants communs pour éliminer la duplication, et établit des services backend pour la gestion des tokens et des intents.

## Motivation
en: The original codebase had severe maintainability issues: App.tsx had 2151 lines with 24 useState hooks, App.css had 4913 lines with 288+ hardcoded colors, server/index.ts had 1962 lines with repeated intent loading code. This refactoring improves code organization, reduces duplication, and establishes patterns for future development.
fr: Le codebase original avait de sérieux problèmes de maintenabilité : App.tsx avait 2151 lignes avec 24 useState hooks, App.css avait 4913 lignes avec 288+ couleurs codées en dur, server/index.ts avait 1962 lignes avec du code de chargement d'intents répété. Ce refactoring améliore l'organisation du code, réduit la duplication, et établit des patterns pour le développement futur.

## Chunks

### @chunk:css-design-system | CSS Design System Overview
### fr: Vue d'ensemble du Système de Design CSS
en: Centralized design tokens in `src/styles/theme.css` providing consistent theming across the application. All colors, typography, spacing, and effects are defined as CSS custom properties.
fr: Tokens de design centralisés dans `src/styles/theme.css` fournissant un thème cohérent dans toute l'application. Toutes les couleurs, typographies, espacements et effets sont définis comme propriétés CSS personnalisées.

> Decision: Use CSS custom properties instead of Sass/preprocessors for runtime flexibility and native browser support
> fr: Utiliser les propriétés CSS personnalisées au lieu de Sass/preprocessors pour la flexibilité runtime et le support natif des navigateurs

> Decision: Follow GitHub dark theme color palette for visual consistency with developer tools
> fr: Suivre la palette de couleurs du thème sombre GitHub pour la cohérence visuelle avec les outils développeur

### @pattern:--color-bg | Background Color Variables
### fr: Variables de Couleurs de Fond
en: Four-level background hierarchy for visual depth: primary (#0d1117) for main background, secondary (#161b22) for panels/cards, tertiary (#21262d) for headers/active states, quaternary (#30363d) for hover states.
fr: Hiérarchie de fond à quatre niveaux pour la profondeur visuelle : primary pour le fond principal, secondary pour les panneaux/cartes, tertiary pour les en-têtes/états actifs, quaternary pour les états hover.

Key variables:
- `--color-bg-primary`: #0d1117 - Darkest, main background
- `--color-bg-secondary`: #161b22 - Panels, cards
- `--color-bg-tertiary`: #21262d - Headers, active states
- `--color-bg-quaternary`: #30363d - Hover states
- `--color-bg-overlay`: rgba(0, 0, 0, 0.5) - Modal overlays

### @pattern:--color-accent | Accent Color Variables
### fr: Variables de Couleurs d'Accent
en: Semantic accent colors for different UI states and actions. Each color has a base and muted variant (15% opacity) for backgrounds.
fr: Couleurs d'accent sémantiques pour différents états et actions UI. Chaque couleur a une variante de base et atténuée (15% opacité) pour les fonds.

Key variables:
- `--color-accent-blue`: #58a6ff - Links, primary actions
- `--color-accent-purple`: #a371f7 - Selected items, intents
- `--color-accent-green`: #3fb950 - Success, additions
- `--color-accent-red`: #f85149 - Errors, deletions
- `--color-accent-yellow`: #e3b341 - Warnings, stale indicators

### @pattern:--font-family | Typography Variables
### fr: Variables de Typographie
en: Font stacks for sans-serif and monospace text with comprehensive fallbacks. Includes font size scale from xs (11px) to 3xl (32px).
fr: Familles de polices pour texte sans-serif et monospace avec fallbacks complets. Inclut une échelle de tailles de xs (11px) à 3xl (32px).

Key variables:
- `--font-family-sans`: "Inter", -apple-system, BlinkMacSystemFont...
- `--font-family-mono`: "SF Mono", "Fira Code", "JetBrains Mono"...
- `--font-size-sm`: 0.75rem (12px)
- `--font-size-base`: 0.875rem (14px)
- `--font-size-md`: 1rem (16px)

### @pattern:--spacing | Spacing Scale Variables
### fr: Variables d'Échelle d'Espacement
en: Consistent spacing scale based on 4px increments for margins, padding, and gaps.
fr: Échelle d'espacement cohérente basée sur des incréments de 4px pour marges, padding et gaps.

Key variables:
- `--spacing-1`: 0.25rem (4px)
- `--spacing-2`: 0.5rem (8px)
- `--spacing-3`: 0.75rem (12px)
- `--spacing-4`: 1rem (16px)
- `--spacing-6`: 1.5rem (24px)
- `--spacing-8`: 2rem (32px)

### @pattern:--radius | Border Radius Variables
### fr: Variables de Rayons de Bordure
en: Consistent border radius values for rounded corners, from subtle (3px) to fully rounded (9999px).
fr: Valeurs de border-radius cohérentes pour les coins arrondis, de subtil (3px) à complètement arrondi (9999px).

Key variables:
- `--radius-xs`: 3px - Subtle rounding
- `--radius-sm`: 4px - Default for small elements
- `--radius-md`: 6px - Cards, buttons
- `--radius-lg`: 8px - Modals, panels
- `--radius-full`: 9999px - Pills, avatars

### @pattern:.badge | Badge Utility Classes
### fr: Classes Utilitaires Badge
en: Pre-built badge styles for quick implementation of status indicators. Available in all accent colors (blue, purple, green, red, yellow, orange).
fr: Styles de badges prédéfinis pour une implémentation rapide d'indicateurs de statut. Disponibles dans toutes les couleurs d'accent.

Usage:
```html
<span class="badge badge-green">Success</span>
<span class="badge badge-red">Error</span>
<span class="badge badge-purple">Intent</span>
```

### @pattern:.card | Card Utility Classes
### fr: Classes Utilitaires Card
en: Card styling with optional interactive state. Provides consistent background, border, and hover effects.
fr: Style de carte avec état interactif optionnel. Fournit fond, bordure et effets hover cohérents.

Usage:
```html
<div class="card">Static card</div>
<div class="card card-interactive">Clickable card</div>
```

### @chunk:hooks-architecture | React Hooks Architecture
### fr: Architecture des Hooks React
en: Custom hooks encapsulate complex state logic, making components cleaner and logic reusable. Each hook follows the single responsibility principle.
fr: Les hooks personnalisés encapsulent la logique d'état complexe, rendant les composants plus propres et la logique réutilisable. Chaque hook suit le principe de responsabilité unique.

> Decision: Extract hooks before components to establish clear data flow boundaries
> fr: Extraire les hooks avant les composants pour établir des frontières claires de flux de données

@link @function:useAuth | Authentication hook
@link @function:usePRSwitcher | PR navigation hook
@link @function:useFileTree | File tree hook
@link @function:useScrollIndicator | Scroll indicator hook

### @function:useAuth | Authentication State Hook
### fr: Hook d'État d'Authentification
en: Manages GitHub OAuth authentication state. Fetches current user on mount, provides login/logout methods, and tracks loading state. Wraps the lower-level auth functions from lib/auth.ts.
fr: Gère l'état d'authentification GitHub OAuth. Récupère l'utilisateur courant au montage, fournit les méthodes login/logout, et suit l'état de chargement.

Returns:
- `user`: Current authenticated user or null
- `isAuthenticated`: Boolean shorthand
- `isLoading`: True during initial fetch
- `login(redirect?)`: Initiates OAuth flow
- `logout()`: Clears session
- `refresh()`: Re-fetches current user

> Decision: useCallback for all methods to prevent unnecessary re-renders when passed as props
> fr: useCallback pour toutes les méthodes pour éviter les re-renders inutiles quand passées en props

### @function:usePRSwitcher | PR Dropdown State Hook
### fr: Hook d'État du Dropdown PR
en: Manages PR switcher dropdown: visibility, cached PR list, loading state, and click-outside detection. Lazy loads PRs only on first open.
fr: Gère le dropdown PR switcher : visibilité, liste de PRs en cache, état de chargement, et détection de clic extérieur. Charge les PRs seulement à la première ouverture.

Returns:
- `isOpen`: Dropdown visibility
- `prs`: Cached list of open PRs
- `isLoading`: True while fetching
- `toggle()`: Toggle dropdown and fetch if needed
- `close()`: Close dropdown
- `navigateTo(prNumber)`: Navigate to PR
- `dropdownRef`: Ref for click-outside detection

> Decision: Cache PRs in state to avoid refetching on every toggle
> fr: Mettre en cache les PRs pour éviter de recharger à chaque toggle

> Decision: Use useRef + mousedown listener for click-outside, more reliable than blur
> fr: Utiliser useRef + mousedown pour clic extérieur, plus fiable que blur

### @function:buildFileTree | File Tree Builder
### fr: Constructeur d'Arbre de Fichiers
en: Builds hierarchical tree structure from flat file list. Collapses single-child folders (src/components becomes one node), sorts folders before files, handles new/modified file indicators.
fr: Construit une structure d'arbre hiérarchique à partir d'une liste plate de fichiers. Collapse les dossiers à enfant unique, trie les dossiers avant les fichiers, gère les indicateurs nouveau/modifié.

Algorithm:
1. Parse file paths into tree nodes
2. Collapse single-child folders recursively
3. Sort: folders first, then files, alphabetically

> Decision: Collapse single-child folders for cleaner display (GitHub style)
> fr: Collapse les dossiers à enfant unique pour un affichage plus propre (style GitHub)

@link @function:useFileTree | Used by file tree hook

### @function:useFileTree | File Tree State Hook
### fr: Hook d'État de l'Arbre de Fichiers
en: Manages file tree state: builds tree from files, tracks expanded folders, provides expand/collapse controls.
fr: Gère l'état de l'arbre de fichiers : construit l'arbre depuis les fichiers, suit les dossiers ouverts, fournit les contrôles expand/collapse.

Returns:
- `tree`: Built TreeNode[] structure
- `expandedFolders`: Set of expanded folder paths
- `toggleFolder(path)`: Toggle single folder
- `expandAll()`: Expand all folders
- `collapseAll()`: Collapse all folders
- `isExpanded(path)`: Check if folder is expanded

> Decision: Auto-expand all folders when files change for better initial UX
> fr: Auto-expand tous les dossiers quand les fichiers changent pour une meilleure UX initiale

### @function:useScrollIndicator | Scroll Marker Calculator Hook
### fr: Hook de Calcul des Marqueurs de Scroll
en: Calculates position of chunk markers for the scroll indicator. Uses MutationObserver to detect DOM changes (chunk expand/collapse) and recalculates positions.
fr: Calcule la position des marqueurs de chunks pour l'indicateur de scroll. Utilise MutationObserver pour détecter les changements DOM et recalcule les positions.

Algorithm:
1. Query DOM for chunk card elements
2. Get bounding rect + scroll position
3. Convert to percentage of document height
4. Watch for DOM mutations with MutationObserver

Returns: `ScrollMarker[]` with id, anchor, top%, height%, isHighlighted

> Decision: Use MutationObserver with 50ms debounce to avoid excessive recalculations
> fr: Utiliser MutationObserver avec debounce 50ms pour éviter les recalculs excessifs

> Decision: Calculate after 100ms delay to let DOM settle after data load
> fr: Calculer après 100ms de délai pour laisser le DOM se stabiliser après chargement

### @chunk:common-components | Common Components
### fr: Composants Communs
en: Reusable UI components that eliminate code duplication. Previously, PRSwitcher was copied 3 times in App.tsx - now it's a single component.
fr: Composants UI réutilisables qui éliminent la duplication de code. Auparavant, PRSwitcher était copié 3 fois dans App.tsx - maintenant c'est un seul composant.

> Decision: Create barrel export (index.ts) for cleaner imports
> fr: Créer un barrel export (index.ts) pour des imports plus propres

### @function:PRSwitcher | PR Dropdown Component
### fr: Composant Dropdown PR
en: Stateless dropdown component for switching between open PRs. Receives all state from parent (via usePRSwitcher hook). Shows browse-main link in PR view, current branch indicator in browse view.
fr: Composant dropdown stateless pour naviguer entre les PRs ouvertes. Reçoit tout l'état du parent (via hook usePRSwitcher). Affiche lien browse-main en vue PR, indicateur de branche en vue browse.

Props:
- `isOpen`: Control visibility
- `isLoading`: Show loading spinner
- `prs`: List of open PRs
- `owner/repo`: Repository info
- `currentPrNumber`: Currently viewed PR
- `currentBranch`: Current branch (browse mode)
- `isPRView/isBrowseView`: Mode flags
- `onNavigate`: Navigation callback

> Decision: Stateless component - all logic in hook, component just renders
> fr: Composant stateless - toute la logique dans le hook, le composant ne fait que rendre

### @function:ScrollIndicator | Scroll Position Indicator Component
### fr: Composant Indicateur de Position de Scroll
en: Fixed-position indicator on viewport edge showing chunk positions. Clicking a marker scrolls to that chunk.
fr: Indicateur en position fixe sur le bord du viewport montrant les positions des chunks. Cliquer sur un marqueur scrolle vers ce chunk.

Props:
- `markers`: Array of ScrollMarker with position data
- `onMarkerClick`: Optional callback when marker clicked

Features:
- Smooth scroll to chunk on click
- Highlighted vs dimmed states for selected/other intents
- Tooltip showing anchor and filename

### @chunk:backend-services | Backend Services Architecture
### fr: Architecture des Services Backend
en: Extracted backend logic into focused services. TokenManager handles all GitHub authentication complexity. IntentLoader centralizes intent parsing and resolution logic that was previously duplicated 5+ times.
fr: Logique backend extraite en services focalisés. TokenManager gère toute la complexité d'authentification GitHub. IntentLoader centralise la logique de parsing et résolution d'intents qui était dupliquée 5+ fois.

> Decision: Services are functions/classes, not Express middleware, for better testability
> fr: Les services sont des fonctions/classes, pas du middleware Express, pour meilleure testabilité

### @pattern:isGitHubAppConfigured | GitHub App Configuration Check
### fr: Vérification de Configuration GitHub App
en: Checks if GitHub App is fully configured (App ID, Client ID, Client Secret, Private Key). Falls back to OAuth App if not configured.
fr: Vérifie si l'App GitHub est complètement configurée. Se rabat sur l'OAuth App si non configurée.

> Decision: Support both GitHub App and OAuth App for flexibility
> fr: Supporter GitHub App et OAuth App pour la flexibilité

### @function:generateAppJWT | GitHub App JWT Generator
### fr: Générateur JWT pour GitHub App
en: Creates signed JWT for authenticating as the GitHub App. Uses RS256 algorithm with the app's private key. Token expires in 10 minutes per GitHub requirements.
fr: Crée un JWT signé pour s'authentifier comme l'App GitHub. Utilise l'algorithme RS256 avec la clé privée de l'app. Token expire en 10 minutes selon les exigences GitHub.

> Decision: Use jose library for JWT signing - modern, typed, and secure
> fr: Utiliser la librairie jose pour la signature JWT - moderne, typée et sécurisée

### @function:getInstallationToken | GitHub Installation Token
### fr: Token d'Installation GitHub
en: Gets or refreshes installation access token for a repository. Caches tokens for 55 minutes (GitHub tokens last 1 hour). Falls back gracefully if app not installed.
fr: Obtient ou rafraîchit le token d'accès d'installation pour un dépôt. Met en cache les tokens pendant 55 minutes. Se rabat gracieusement si l'app n'est pas installée.

> Decision: Cache tokens for 55 minutes (5 min buffer before 1h expiry)
> fr: Mettre en cache les tokens 55 minutes (5 min de marge avant expiration 1h)

@link @function:generateAppJWT | Uses JWT to authenticate
@link @function:getInstallationId | Gets installation ID first

### @function:getRepoAccessToken | Repository Access Token Resolver
### fr: Résolveur de Token d'Accès au Dépôt
en: Determines best token to use for accessing a repository. Priority: 1) GitHub App installation token (read-only, preferred), 2) User's OAuth token, 3) Server token (for public repos).
fr: Détermine le meilleur token à utiliser pour accéder à un dépôt. Priorité : 1) Token d'installation GitHub App (lecture seule, préféré), 2) Token OAuth utilisateur, 3) Token serveur (pour dépôts publics).

Returns: `{ token: string | null, source: "installation" | "user" | "server" | null }`

> Decision: Prefer installation tokens for read-only access - least privilege principle
> fr: Préférer les tokens d'installation pour l'accès lecture seule - principe du moindre privilège

### @function:detectOverlaps | Chunk Overlap Detection
### fr: Détection de Chevauchement de Chunks
en: Detects when multiple chunks reference overlapping line ranges in the same file. Returns a map of anchor -> overlapping anchors.
fr: Détecte quand plusieurs chunks référencent des plages de lignes qui se chevauchent dans le même fichier. Retourne une map anchor -> anchors chevauchants.

Algorithm:
1. Group chunks by resolved file
2. For each file, compare all chunk pairs
3. If line ranges intersect: aStart <= bEnd AND bStart <= aEnd
4. Add bidirectional overlap entries

@link @function:applyOverlaps | Applies detected overlaps to intents

### @function:loadLocalManifest | Local Manifest Loader
### fr: Chargeur de Manifeste Local
en: Loads and parses manifest.yaml from a local repository's .intent folder.
fr: Charge et parse manifest.yaml depuis le dossier .intent d'un dépôt local.

### @function:loadLocalIntents | Local Intents Loader
### fr: Chargeur d'Intents Local
en: Loads intent files from local repository with language fallback. Tries language-specific file first (e.g., feature.intent.fr.md), then falls back to base file.
fr: Charge les fichiers intent depuis un dépôt local avec fallback de langue. Essaie d'abord le fichier spécifique à la langue, puis se rabat sur le fichier de base.

### @function:loadGitHubManifest | GitHub Manifest Loader
### fr: Chargeur de Manifeste GitHub
en: Fetches and parses manifest.yaml from a GitHub repository via API.
fr: Récupère et parse manifest.yaml depuis un dépôt GitHub via l'API.

### @function:resolveLocalAnchors | Local Anchor Resolver
### fr: Résolveur d'Ancres Local
en: Resolves semantic anchors to actual line numbers for local files. Tries each file in the intent's files list until anchor is found.
fr: Résout les ancres sémantiques en numéros de ligne réels pour les fichiers locaux. Essaie chaque fichier dans la liste des fichiers de l'intent jusqu'à trouver l'ancre.

@link @function:resolveAnchor | Core anchor resolution logic in lib/anchorResolver.ts

### @function:resolveGitHubAnchors | GitHub Anchor Resolver
### fr: Résolveur d'Ancres GitHub
en: Same as resolveLocalAnchors but fetches file content from GitHub API.
fr: Même chose que resolveLocalAnchors mais récupère le contenu des fichiers depuis l'API GitHub.

### @function:applyOverlaps | Overlap Application
### fr: Application des Chevauchements
en: Applies detected overlaps to resolved intents. Adds `overlaps` array to each chunk that has overlapping chunks.
fr: Applique les chevauchements détectés aux intents résolus. Ajoute un tableau `overlaps` à chaque chunk qui a des chunks chevauchants.

@link @function:detectOverlaps | Uses overlap detection

---
