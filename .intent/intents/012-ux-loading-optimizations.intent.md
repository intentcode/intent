---
id: "012"
from: HEAD
author: claude
date: 2025-01-17
status: active
risk: low
tags: [feature, ux, performance]
files:
  - src/App.tsx
  - src/App.css
  - src/components/DiffViewer.tsx
  - src/lib/language.ts
---

# UX Improvements: Loading States & Story Mode Optimizations
# fr: Améliorations UX : États de Chargement & Optimisations du Mode Récit

## Summary
en: Improved user experience with contextual loading indicators, optimized story mode to reuse loaded data, and added smooth CSS transitions for view mode changes. Also added chunk navigation from story mode to code view.
fr: Amélioration de l'expérience utilisateur avec des indicateurs de chargement contextuels, optimisation du mode récit pour réutiliser les données chargées, et ajout de transitions CSS fluides pour les changements de mode de vue. Ajout également de la navigation des chunks depuis le mode récit vers le code.

## Motivation
en: Users experienced delays and lack of feedback when loading data or switching view modes. The story mode was reloading all data unnecessarily when toggling, causing slow transitions.
fr: Les utilisateurs subissaient des délais et un manque de feedback lors du chargement des données ou du changement de mode de vue. Le mode récit rechargeait inutilement toutes les données lors du toggle, causant des transitions lentes.

## Chunks

### @pattern:loading-page | Contextual Loading Page
### fr: Page de Chargement Contextuel
en: Added a dedicated loading page component that displays:
- Purple themed spinner (matching app colors)
- Context-aware message (e.g., "Loading Pull Request...", "Comparing branches...")
- Repository name when loading from GitHub

Different loading contexts:
- `diff`: Loading local diff
- `browse`: Loading code in browse mode
- `story`: Loading story mode
- `github-pr`: Loading GitHub Pull Request
- `github-branches`: Comparing GitHub branches
- `github-browse`: Loading GitHub repository

fr: Ajout d'un composant page de chargement dédié qui affiche :
- Spinner aux couleurs du thème (violet)
- Message contextuel (ex: "Chargement de la Pull Request...", "Comparaison des branches...")
- Nom du repository lors du chargement depuis GitHub

Différents contextes de chargement :
- `diff`: Chargement du diff local
- `browse`: Chargement du code en mode parcours
- `story`: Chargement du mode récit
- `github-pr`: Chargement d'une Pull Request GitHub
- `github-branches`: Comparaison de branches GitHub
- `github-browse`: Chargement d'un repository GitHub

> Decision: Use inline loading page instead of overlay to avoid blocking UI
> fr: Utiliser une page de chargement inline plutôt qu'un overlay pour ne pas bloquer l'UI

### @pattern:loading-spinner | Loading Spinner Styles
### fr: Styles du Spinner de Chargement
en: CSS styles for the loading components:
- `.loading-page`: Centered flex container with padding
- `.loading-spinner`: 48px purple spinning circle
- `.loading-text`: Context message in light text
- `.loading-repo`: Repository badge with purple accent

Uses `@keyframes spin` animation for smooth rotation.

fr: Styles CSS pour les composants de chargement :
- `.loading-page`: Container flex centré avec padding
- `.loading-spinner`: Cercle violet tournant de 48px
- `.loading-text`: Message contextuel en texte clair
- `.loading-repo`: Badge repository avec accent violet

Utilise l'animation `@keyframes spin` pour une rotation fluide.

### @function:switchViewMode | Optimized View Mode Switching
### fr: Changement de Mode de Vue Optimisé
en: Simplified the view mode switching to be instant:
- No loading overlay needed
- Direct state change with `setViewMode()`
- CSS animations handle visual feedback
- Story mode reuses already loaded intents data

Previously, switching to story mode was calling `loadStory()` which made an API call. Now it just changes the view mode since data is already loaded.

fr: Simplification du changement de mode de vue pour qu'il soit instantané :
- Pas besoin d'overlay de chargement
- Changement d'état direct avec `setViewMode()`
- Les animations CSS gèrent le feedback visuel
- Le mode récit réutilise les données d'intents déjà chargées

Auparavant, passer en mode récit appelait `loadStory()` qui faisait un appel API. Maintenant ça change juste le mode de vue puisque les données sont déjà chargées.

> Decision: Reuse loaded data instead of reloading for mode switches
> fr: Réutiliser les données chargées au lieu de recharger pour les changements de mode

### @pattern:fadeSlideIn | Story Mode Fade Animation
### fr: Animation de Fondu du Mode Récit
en: Added CSS animation for story mode appearance:
- `fadeSlideIn`: Combines opacity fade (0→1) with slight upward slide (-10px→0)
- Duration: 0.2s with ease-out timing
- Applied to `.story-mode-page` container

Makes the story mode feel responsive and polished.

fr: Ajout d'une animation CSS pour l'apparition du mode récit :
- `fadeSlideIn`: Combine un fondu d'opacité (0→1) avec un léger glissement vers le haut (-10px→0)
- Durée : 0.2s avec timing ease-out
- Appliquée au container `.story-mode-page`

Rend le mode récit réactif et soigné.

### @pattern:fadeIn | Project Overview Fade Animation
### fr: Animation de Fondu de l'Aperçu Projet
en: Simple fade-in animation for the project overview header:
- `fadeIn`: Opacity transition from 0 to 1
- Duration: 0.15s with ease-out timing
- Applied to `.project-overview` container

Provides smooth transition when exiting story mode back to browse mode.

fr: Animation de fondu simple pour le header d'aperçu du projet :
- `fadeIn`: Transition d'opacité de 0 à 1
- Durée : 0.15s avec timing ease-out
- Appliquée au container `.project-overview`

Fournit une transition fluide en sortant du mode récit vers le mode parcours.

### @pattern:expandChunkAnchor | Chunk Expansion from Story Mode
### fr: Expansion des Chunks depuis le Mode Récit
en: Added ability to click on chunks in story mode to navigate to the code:
1. Click on a chunk in the story view
2. Page scrolls to that chunk in the code below
3. Chunk card expands to show full content
4. Chunk is highlighted for 2 seconds

The scroll happens immediately, then the chunk expands after 5ms to ensure smooth UX.

fr: Ajout de la possibilité de cliquer sur les chunks en mode récit pour naviguer vers le code :
1. Cliquer sur un chunk dans la vue récit
2. La page scrolle vers ce chunk dans le code en dessous
3. La carte du chunk s'expand pour montrer le contenu complet
4. Le chunk est surligné pendant 2 secondes

Le scroll se fait immédiatement, puis le chunk s'expand après 5ms pour assurer une UX fluide.

> Decision: Scroll first, then expand to provide immediate visual feedback
> fr: Scroller d'abord, puis expand pour fournir un feedback visuel immédiat

@link @pattern:story-chunk-clickable | Clickable chunk styling

### @pattern:story-chunk-clickable | Clickable Story Chunks
### fr: Chunks Cliquables du Mode Récit
en: Story mode chunks are now interactive with hover effects:
- Cursor changes to pointer on hover
- Background gets a subtle purple/blue gradient
- Border color changes to purple accent
- Slight upward transform (-2px) and shadow

Shows an arrow (→) to indicate navigation action.

fr: Les chunks du mode récit sont maintenant interactifs avec des effets au survol :
- Le curseur change en pointeur au survol
- Le fond obtient un léger dégradé violet/bleu
- La couleur de bordure change vers l'accent violet
- Légère transformation vers le haut (-2px) et ombre

Affiche une flèche (→) pour indiquer l'action de navigation.

### @chunk:loading-translations | Loading Message Translations
### fr: Traductions des Messages de Chargement
en: Added translations for all loading messages in 4 languages:
- English: "Loading Pull Request...", "Comparing branches...", etc.
- French: "Chargement de la Pull Request...", "Comparaison des branches...", etc.
- Spanish: "Cargando Pull Request...", "Comparando ramas...", etc.
- German: "Pull Request wird geladen...", "Branches werden verglichen...", etc.

Keys added:
- `loadingDiff`, `loadingBrowse`, `loadingStory`
- `loadingPR`, `loadingBranches`, `loadingGitHubBrowse`

fr: Ajout des traductions pour tous les messages de chargement en 4 langues :
- Anglais : "Loading Pull Request...", "Comparing branches...", etc.
- Français : "Chargement de la Pull Request...", "Comparaison des branches...", etc.
- Espagnol : "Cargando Pull Request...", "Comparando ramas...", etc.
- Allemand : "Pull Request wird geladen...", "Branches werden verglichen...", etc.

Clés ajoutées :
- `loadingDiff`, `loadingBrowse`, `loadingStory`
- `loadingPR`, `loadingBranches`, `loadingGitHubBrowse`

## Testing Notes
en: Test the UX improvements by:
1. Load a GitHub repository - verify contextual loading message appears
2. Switch between Browse and Story mode - should be instant with fade animation
3. Click on a chunk in Story mode - should scroll and expand the chunk
4. Change language - loading messages should be translated

fr: Tester les améliorations UX en :
1. Charger un repository GitHub - vérifier que le message de chargement contextuel apparaît
2. Basculer entre les modes Parcours et Récit - doit être instantané avec animation de fondu
3. Cliquer sur un chunk en mode Récit - doit scroller et expand le chunk
4. Changer la langue - les messages de chargement doivent être traduits
