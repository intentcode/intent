---
id: "015"
from: HEAD
author: claude
date: 2025-01-18
status: active
risk: low
tags: [feature, ui, navigation, ux]
files:
  - src/App.tsx
  - src/App.css
  - src/lib/api.ts
  - server/index.ts
---

# Navigation Enhancements
# fr: Améliorations de Navigation

## Summary
en: Three new navigation features to improve code review experience: PR switcher dropdown for quick navigation between open PRs, global scroll indicator showing chunk positions on the viewport edge, and current file highlighting in the sidebar.
fr: Trois nouvelles fonctionnalités de navigation pour améliorer l'expérience de revue de code : menu déroulant pour naviguer entre les PRs ouvertes, indicateur de scroll global montrant les positions des chunks sur le bord de l'écran, et mise en évidence du fichier courant dans la sidebar.

## Motivation
en: When reviewing PRs in large repositories, developers need quick ways to navigate between PRs and understand where documented code chunks are located. The scroll indicator provides a minimap-like overview, while the file indicator helps maintain context when scrolling through long diffs.
fr: Lors de la revue de PRs dans de grands dépôts, les développeurs ont besoin de moyens rapides pour naviguer entre les PRs et comprendre où se trouvent les chunks documentés. L'indicateur de scroll fournit une vue d'ensemble type minimap, tandis que l'indicateur de fichier aide à garder le contexte lors du défilement dans de longs diffs.

## Chunks

### @pattern:prSwitcherOpen | PR Switcher State Management
### fr: Gestion de l'état du PR Switcher
en: State variables for the PR switcher dropdown: visibility toggle, cached PR list, and loading state. Uses useRef for click-outside detection.
fr: Variables d'état pour le menu déroulant PR : toggle de visibilité, liste de PRs en cache, et état de chargement. Utilise useRef pour détecter les clics extérieurs.

> Decision: Cache PR list in state to avoid refetching when toggling dropdown
> fr: Mettre en cache la liste des PRs pour éviter de recharger à chaque ouverture

### @function:togglePRSwitcher | PR Switcher Toggle Logic
### fr: Logique de Toggle du PR Switcher
en: Async function that toggles the dropdown and fetches PRs on first open. Only fetches if the list is empty and not already loading.
fr: Fonction async qui toggle le dropdown et charge les PRs à la première ouverture. Ne charge que si la liste est vide et pas déjà en cours de chargement.

> Decision: Lazy load PRs only when dropdown is first opened to avoid unnecessary API calls
> fr: Charger les PRs seulement à la première ouverture pour éviter les appels API inutiles

### @function:navigateToPR | PR Navigation Handler
### fr: Gestionnaire de Navigation PR
en: Simple navigation function that redirects to a different PR URL within the same repository.
fr: Fonction simple qui redirige vers une autre PR du même dépôt.

### @pattern:diff-context-badge.*clickable | Clickable Context Badge
### fr: Badge de Contexte Cliquable
en: The diff context badge becomes interactive when viewing a PR. Shows a chevron indicator and triggers the PR switcher dropdown on click.
fr: Le badge de contexte devient interactif lors de la visualisation d'une PR. Affiche un chevron et déclenche le dropdown au clic.

> Decision: Only make badge clickable for PR mode, not for branch comparisons
> fr: Rendre le badge cliquable uniquement en mode PR, pas pour les comparaisons de branches

### @pattern:pr-switcher-dropdown | PR Dropdown Component
### fr: Composant Dropdown des PRs
en: Floating dropdown panel showing open PRs with author avatar, PR number, title, branch info, and draft status. Positioned absolutely below the context badge. Includes a quick link to browse the main branch.
fr: Panneau flottant montrant les PRs ouvertes avec avatar de l'auteur, numéro de PR, titre, info de branche, et statut draft. Positionné sous le badge de contexte. Inclut un lien rapide pour parcourir la branche principale.

@link @pattern:pr-switcher-item | Uses PR item component
@link @pattern:pr-switcher-browse-main | Uses browse main link

### @pattern:pr-switcher-browse-main | Browse Main Branch Link
### fr: Lien vers la Branche Principale
en: Green-tinted link at the top of the PR dropdown that navigates to the repository's main branch in browse mode. Provides quick access to the full codebase without leaving the PR context. Only shown when viewing a PR, not when already browsing.
fr: Lien teinté de vert en haut du dropdown PR qui navigue vers la branche principale du dépôt en mode browse. Permet un accès rapide à la base de code complète sans quitter le contexte de la PR. Affiché uniquement lors de la visualisation d'une PR, pas en mode browse.

> Decision: Use green color to differentiate from PR items (blue) and indicate "browse" action
> fr: Utiliser une couleur verte pour différencier des items PR (bleus) et indiquer l'action "parcourir"

### @pattern:pr-switcher-current-branch | Current Branch Indicator
### fr: Indicateur de la Branche Courante
en: Purple-tinted indicator shown when browsing a branch (not viewing a PR). Displays the current branch name so users know where they are in the repository.
fr: Indicateur teinté de violet affiché lors de la navigation sur une branche (pas sur une PR). Affiche le nom de la branche courante pour que les utilisateurs sachent où ils se trouvent dans le dépôt.

> Decision: Use purple to match the app's accent color and differentiate from the green "browse main" action
> fr: Utiliser le violet pour correspondre à la couleur d'accent de l'app et différencier de l'action verte "parcourir main"

### @pattern:canShowPRSwitcher | Unified PR Switcher Logic
### fr: Logique Unifiée du PR Switcher
en: The PR switcher dropdown is now available in both PR view and GitHub browse mode. Uses a single boolean `canShowPRSwitcher` to determine if the dropdown should be shown, enabling seamless navigation between PRs from any GitHub view.
fr: Le dropdown PR switcher est maintenant disponible en mode PR et en mode browse GitHub. Utilise un booléen unique `canShowPRSwitcher` pour déterminer si le dropdown doit être affiché, permettant une navigation fluide entre les PRs depuis n'importe quelle vue GitHub.

> Decision: Reuse the same dropdown component for both modes to maintain consistency
> fr: Réutiliser le même composant dropdown pour les deux modes pour maintenir la cohérence

### @pattern:project-overview-branch-wrapper | Branch Info with PR Dropdown
### fr: Info de Branche avec Dropdown PR
en: The branch info section in the project overview header is now clickable when viewing a GitHub repository. Clicking opens the same PR switcher dropdown, allowing users to quickly navigate to any open PR from the browse view.
fr: La section info de branche dans l'en-tête du projet est maintenant cliquable lors de la visualisation d'un dépôt GitHub. Un clic ouvre le même dropdown PR switcher, permettant aux utilisateurs de naviguer rapidement vers n'importe quelle PR ouverte depuis la vue browse.

> Decision: Add chevron indicator to signal interactivity on the branch badge
> fr: Ajouter un indicateur chevron pour signaler l'interactivité sur le badge de branche

> Decision: Position dropdown absolutely below the branch badge for consistent UX
> fr: Positionner le dropdown de manière absolue sous le badge de branche pour une UX cohérente

### @pattern:pr-switcher-item | PR List Item
### fr: Élément de Liste PR
en: Individual PR item with hover state, active state for current PR, and visual hierarchy: number > title > branch info. Includes draft and current badges.
fr: Élément de PR individuel avec état hover, état actif pour la PR courante, et hiérarchie visuelle : numéro > titre > info branche. Inclut les badges draft et current.

### @pattern:global-scroll-indicator | Global Scroll Indicator Container
### fr: Conteneur de l'Indicateur de Scroll Global
en: Fixed-position container on the right edge of the viewport that displays chunk position markers. Uses position:fixed to stay visible during scrolling.
fr: Conteneur en position fixe sur le bord droit du viewport qui affiche les marqueurs de position des chunks. Utilise position:fixed pour rester visible pendant le défilement.

> Decision: Position fixed at right:4px to not overlap with browser scrollbar
> fr: Position fixe à right:4px pour ne pas chevaucher la scrollbar du navigateur

### @pattern:global-scroll-marker | Scroll Marker Styling
### fr: Style des Marqueurs de Scroll
en: Individual markers with purple-blue gradient, glow effect, and smooth hover transitions. Dimmed state for non-selected intent chunks.
fr: Marqueurs individuels avec dégradé violet-bleu, effet de lueur, et transitions hover fluides. État grisé pour les chunks des intents non sélectionnés.

> Decision: Use gradient and glow to make markers visible against dark background
> fr: Utiliser dégradé et lueur pour rendre les marqueurs visibles sur fond sombre

### @pattern:calculateMarkers | Scroll Marker Position Calculation
### fr: Calcul des Positions des Marqueurs
en: useEffect that calculates marker positions by querying DOM elements. Uses getBoundingClientRect() to get absolute positions, then converts to percentages of document height. Includes MutationObserver to detect DOM changes when chunks expand/collapse.
fr: useEffect qui calcule les positions des marqueurs en interrogeant les éléments DOM. Utilise getBoundingClientRect() pour obtenir les positions absolues, puis convertit en pourcentages de la hauteur du document. Inclut un MutationObserver pour détecter les changements DOM quand les chunks s'ouvrent/ferment.

> Decision: Recalculate on resize, after DOM settles (100ms delay), and on any DOM mutation in the content area
> fr: Recalculer au resize, après stabilisation du DOM (délai de 100ms), et à toute mutation DOM dans la zone de contenu

> Decision: Use MutationObserver with debounced callback (50ms) to avoid excessive recalculations
> fr: Utiliser MutationObserver avec callback debounced (50ms) pour éviter les recalculs excessifs

### @pattern:tree-file.current | Current File Highlight
### fr: Mise en Évidence du Fichier Courant
en: CSS styling for the currently visible file in the sidebar: blue left border, gradient background, and pulsing dot indicator.
fr: Style CSS pour le fichier visible actuellement dans la sidebar : bordure bleue à gauche, fond en dégradé, et indicateur point pulsant.

> Decision: Use IntersectionObserver with rootMargin to detect file visibility
> fr: Utiliser IntersectionObserver avec rootMargin pour détecter la visibilité du fichier

### @pattern:handleClickOutside | Click Outside Handler
### fr: Gestionnaire de Clic Extérieur
en: useEffect that adds/removes mousedown listener to close PR switcher when clicking outside. Only active when dropdown is open.
fr: useEffect qui ajoute/supprime un listener mousedown pour fermer le PR switcher lors d'un clic extérieur. Actif uniquement quand le dropdown est ouvert.

### @function:fetchOpenPRs | Open PRs API Function
### fr: Fonction API des PRs Ouvertes
en: Client-side API function that fetches open PRs for a repository. Returns PR number, title, author info, branch names, and draft status.
fr: Fonction API côté client qui récupère les PRs ouvertes d'un dépôt. Retourne numéro de PR, titre, info auteur, noms de branches, et statut draft.

### @pattern:api/github-prs | GitHub PRs Endpoint
### fr: Endpoint GitHub PRs
en: Server endpoint that queries GitHub API for open PRs, sorted by update date. Returns top 10 PRs with essential metadata for the switcher.
fr: Endpoint serveur qui interroge l'API GitHub pour les PRs ouvertes, triées par date de mise à jour. Retourne les 10 dernières PRs avec les métadonnées essentielles pour le switcher.

> Decision: Limit to 10 PRs to keep dropdown manageable
> fr: Limiter à 10 PRs pour garder le dropdown gérable

---
