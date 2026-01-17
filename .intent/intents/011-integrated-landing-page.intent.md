---
id: "011"
from: HEAD
author: claude
date: 2025-01-17
status: active
risk: low
tags: [feature, ui, landing, marketing]
files:
  - src/components/LandingPage.tsx
  - src/components/LandingPage.css
  - src/main.tsx
---

# Integrated Landing Page
# fr: Page d'accueil intégrée

## Summary
en: Merges the marketing landing page directly into the Intent app. The landing page serves as the entry point with a GitHub URL input that navigates to PR/repo views. Includes marketing sections (problem, solution, features, how it works) below the hero.
fr: Fusionne la page marketing directement dans l'application Intent. La landing page sert de point d'entrée avec un champ URL GitHub qui navigue vers les vues PR/repo. Inclut des sections marketing (problème, solution, fonctionnalités, comment ça marche) sous le hero.

## Motivation
en: Having a separate landing page and app created friction. Users had to navigate between two different sites. By integrating them, we provide a seamless experience where users can immediately start using Intent from the landing page input field.
fr: Avoir une landing page et une app séparées créait des frictions. Les utilisateurs devaient naviguer entre deux sites différents. En les intégrant, on offre une expérience fluide où les utilisateurs peuvent immédiatement utiliser Intent depuis le champ de saisie de la landing.

## Chunks

### @function:LandingPage | Main Landing Component
### fr: Composant principal de la landing
en: React component that renders the full landing page with hero section, GitHub URL input, marketing sections, and footer. Handles URL parsing and navigation to the appropriate app view (PR, compare, browse).
fr: Composant React qui affiche la page d'accueil complète avec section hero, champ URL GitHub, sections marketing et footer. Gère le parsing d'URL et la navigation vers la vue appropriée de l'app (PR, compare, browse).

> Decision: Single scrollable page with hero + input at top, marketing below
> fr: Page unique scrollable avec hero + input en haut, marketing en dessous

> Decision: URL parsing supports multiple formats: PR, compare, tree, and simple repo URLs
> fr: Le parsing d'URL supporte plusieurs formats: PR, compare, tree, et URLs de repo simples

@link @function:parseAndNavigate | URL parsing and navigation logic

### @function:parseAndNavigate | URL Parser
### fr: Parseur d'URL
en: Parses GitHub URLs in various formats and navigates to the appropriate route. Strips https:// and github.com/ prefixes, then matches against PR, compare, tree, or simple repo patterns.
fr: Parse les URLs GitHub dans différents formats et navigue vers la route appropriée. Enlève les préfixes https:// et github.com/, puis matche les patterns PR, compare, tree, ou repo simple.

Supported formats:
- PR: `owner/repo/pull/123`
- Compare: `owner/repo/compare/base...head`
- Tree: `owner/repo/tree/branch`
- Repo: `owner/repo`

> Decision: Accept URLs with or without protocol prefix for user convenience
> fr: Accepter les URLs avec ou sans préfixe de protocole pour la commodité de l'utilisateur

### @pattern:landing-hero | Hero Section
### fr: Section Hero
en: Full-viewport hero with gradient background, main headline, subtitle, and the GitHub URL input form. Includes quick links to local mode and example repos that have real intents.
fr: Hero plein écran avec fond dégradé, titre principal, sous-titre, et le formulaire de saisie d'URL GitHub. Inclut des liens rapides vers le mode local et des repos exemples qui ont de vrais intents.

> Decision: Examples point to intentcode/intent repo which has actual intent files
> fr: Les exemples pointent vers le repo intentcode/intent qui a de vrais fichiers intent

@link @pattern:landing-scroll-indicator | Smooth scroll indicator

### @pattern:landing-scroll-indicator | Scroll Indicator
### fr: Indicateur de défilement
en: Bouncing arrow at the bottom of the hero that smoothly scrolls to the problem section when clicked. Uses CSS animation for the bounce effect and JavaScript scrollIntoView with smooth behavior.
fr: Flèche rebondissante en bas du hero qui fait défiler progressivement vers la section problème au clic. Utilise une animation CSS pour l'effet de rebond et JavaScript scrollIntoView avec comportement smooth.

> Decision: Use button element with smooth scrollIntoView instead of anchor jump
> fr: Utiliser un élément button avec scrollIntoView smooth au lieu d'un saut d'ancre

### @pattern:const T: Record | Translations Object
### fr: Objet de traductions
en: Contains all UI strings in English, French, and Spanish. Each language has the same keys for consistent translation lookup. The current language is passed as a prop from the parent component.
fr: Contient toutes les chaînes UI en anglais, français et espagnol. Chaque langue a les mêmes clés pour une recherche de traduction cohérente. La langue actuelle est passée en prop depuis le composant parent.

> Decision: Trilingual support (EN/FR/ES) with language selector in nav
> fr: Support trilingue (EN/FR/ES) avec sélecteur de langue dans la nav

### @pattern:createBrowserRouter | Router Configuration
### fr: Configuration du routeur
en: React Router configuration with landing page at root and /home, local mode at /local, and GitHub routes for PR, compare, tree, and repo views. Uses LandingWrapper to manage language state.
fr: Configuration React Router avec la landing page à la racine et /home, le mode local à /local, et les routes GitHub pour les vues PR, compare, tree, et repo. Utilise LandingWrapper pour gérer l'état de la langue.

> Decision: Landing page at both / and /home for flexibility
> fr: Landing page à / et /home pour la flexibilité
