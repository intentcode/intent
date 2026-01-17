---
id: "008"
from: HEAD
author: claude
date: 2025-01-14
status: active
risk: low
tags: [feature, ui, ux]
files:
  - src/App.tsx
  - src/App.css
  - src/components/RepoSelector.tsx
---

# UI Improvements: Intent Navigation & Story Mode
# fr: Améliorations UI : Navigation des Intents & Mode Récit

## Summary
en: Major UI improvements to handle scalability and improve intent navigation. Added sidebar intent list with selection, expandable intent header, file tree hierarchy view, and a new Story Mode for reading intents as a narrative.
fr: Améliorations majeures de l'UI pour gérer la scalabilité et améliorer la navigation des intents. Ajout d'une liste d'intents dans la sidebar avec sélection, header expandable pour l'intent, vue arborescente des fichiers, et nouveau Mode Récit pour lire les intents comme un récit.

## Motivation
en: With projects potentially having 30+ intents, the previous flat display became unmanageable. Users needed a way to focus on specific intents and read them without code distraction.
fr: Avec des projets pouvant avoir 30+ intents, l'affichage plat précédent devenait ingérable. Les utilisateurs avaient besoin d'un moyen de se concentrer sur des intents spécifiques et de les lire sans distraction du code.

## Chunks

### @pattern:sidebar-intents | Sidebar Intent List
### fr: Liste des Intents dans la Sidebar
en: Added a new section in the sidebar showing all intents as clickable cards. Each card displays:
- Intent ID and title
- Risk indicator (colored dot)
- Stale chunk indicator
- Number of chunks

Clicking an intent selects it and filters the view to show only its chunks.

fr: Ajout d'une nouvelle section dans la sidebar montrant tous les intents comme des cartes cliquables. Chaque carte affiche :
- ID et titre de l'intent
- Indicateur de risque (point coloré)
- Indicateur de chunks obsolètes
- Nombre de chunks

Cliquer sur un intent le sélectionne et filtre la vue pour n'afficher que ses chunks.

> Decision: Use compact card design to fit many intents without scrolling
> fr: Utiliser un design de carte compact pour afficher plusieurs intents sans scroll

### @pattern:selected-intent-header | Selected Intent Header
### fr: Header de l'Intent Sélectionné
en: When an intent is selected, an expandable header appears above the files content showing:
- Intent ID, risk badge, date
- Full title
- Summary and motivation
- Tags

This provides context without leaving the code view.

fr: Quand un intent est sélectionné, un header expandable apparaît au-dessus du contenu des fichiers montrant :
- ID de l'intent, badge de risque, date
- Titre complet
- Résumé et motivation
- Tags

Cela fournit le contexte sans quitter la vue du code.

> Decision: Use gradient background with left border accent to distinguish from code content
> fr: Utiliser un fond en dégradé avec bordure accent à gauche pour distinguer du contenu code

### @pattern:chunk-filtering | Chunk Filtering by Intent
### fr: Filtrage des Chunks par Intent
en: When an intent is selected, only chunks belonging to that intent are displayed in the diff viewer. This reduces noise when reviewing a specific feature or change.

fr: Quand un intent est sélectionné, seuls les chunks appartenant à cet intent sont affichés dans le viewer de diff. Cela réduit le bruit lors de la revue d'une fonctionnalité ou modification spécifique.

@link @pattern:sidebar-intents | Selection triggers filtering

### @function:buildFileTree | Hierarchical File Tree
### fr: Arborescence Hiérarchique des Fichiers
en: Replaced flat file list with hierarchical tree view. Files are now grouped by directory with proper indentation:
- Folders shown with 📁 icon
- Modified files marked with "M" (yellow)
- New files marked with "+" (green)
- Tree connectors (├── └──) for visual hierarchy
- Folders with single subfolder are collapsed (src/components instead of src/ > components/)
- Sorted: folders first, then files alphabetically

fr: Remplacement de la liste plate de fichiers par une vue arborescente hiérarchique. Les fichiers sont maintenant groupés par répertoire avec indentation appropriée :
- Dossiers affichés avec icône 📁
- Fichiers modifiés marqués "M" (jaune)
- Nouveaux fichiers marqués "+" (vert)
- Connecteurs d'arbre (├── └──) pour la hiérarchie visuelle
- Dossiers avec un seul sous-dossier collapsés (src/components au lieu de src/ > components/)
- Tri : dossiers d'abord, puis fichiers alphabétiquement

> Decision: Use monospace font and tree connectors for IDE-like appearance
> fr: Utiliser une police monospace et des connecteurs d'arbre pour une apparence type IDE

> Decision: Collapse single-child folder chains to reduce visual noise
> fr: Collapser les chaînes de dossiers avec un seul enfant pour réduire le bruit visuel

### @pattern:story-mode | Story Mode
### fr: Mode Récit
en: Added Story Mode as a third option alongside Browse and Compare in the RepoSelector. Story Mode presents intents as a narrative without code:
- Each intent displayed as a "chapter"
- Shows title, summary, motivation, tags
- Lists all chunks with their decisions
- Clean, centered, readable layout

Accessible via the action mode selector when a git repo is selected.

fr: Ajout du Mode Récit comme troisième option à côté de Browse et Compare dans le RepoSelector. Le Mode Récit présente les intents comme un récit sans code :
- Chaque intent affiché comme un "chapitre"
- Montre titre, résumé, motivation, tags
- Liste tous les chunks avec leurs décisions
- Layout propre, centré et lisible

Accessible via le sélecteur de mode d'action quand un repo git est sélectionné.

> Decision: Make Story Mode a peer of Browse/Compare rather than a toggle, as it's a fundamentally different viewing experience
> fr: Faire du Mode Récit un pair de Browse/Compare plutôt qu'un toggle, car c'est une expérience de visualisation fondamentalement différente

### @function:loadStory | Story Mode Data Loading
### fr: Chargement des Données du Mode Récit
en: New function that loads intents without file content. Uses the same browse API but sets `files` to empty array since code display is not needed in Story Mode.

fr: Nouvelle fonction qui charge les intents sans le contenu des fichiers. Utilise la même API browse mais définit `files` comme tableau vide puisque l'affichage du code n'est pas nécessaire en Mode Récit.

@link @pattern:story-mode | Renders the loaded data

### @pattern:tree-action-btn | Tree Action Buttons with Tooltips
### fr: Boutons d'Action de l'Arborescence avec Tooltips
en: Three action buttons in the file tree header:
- Intent toggle (📄/📝): Show/hide .intent/ documentation files
- Expand all (▼): Expand all folders in the tree
- Collapse all (▶): Collapse all folders

Each button has a custom CSS tooltip that appears on hover, using `data-tooltip` attribute and `::after` pseudo-element. Tooltips are translated based on current language.

fr: Trois boutons d'action dans l'en-tête de l'arborescence des fichiers :
- Toggle intent (📄/📝) : Afficher/masquer les fichiers .intent/
- Tout déplier (▼) : Déplier tous les dossiers
- Tout replier (▶) : Replier tous les dossiers

Chaque bouton a un tooltip CSS personnalisé qui apparaît au survol, utilisant l'attribut `data-tooltip` et le pseudo-élément `::after`. Les tooltips sont traduits selon la langue courante.

> Decision: Use CSS tooltips instead of native title attribute for instant display and consistent styling
> fr: Utiliser des tooltips CSS au lieu de l'attribut title natif pour un affichage instantané et un style cohérent

## Testing Notes
en: Test the new UI features by:
1. Load a repo with multiple intents (slack-cleaner recommended)
2. Click on different intents in the sidebar to see filtering
3. Verify the selected intent header displays correctly
4. Check the file tree shows proper hierarchy
5. Try Story Mode from the action selector

fr: Tester les nouvelles fonctionnalités UI en :
1. Charger un repo avec plusieurs intents (slack-cleaner recommandé)
2. Cliquer sur différents intents dans la sidebar pour voir le filtrage
3. Vérifier que le header de l'intent sélectionné s'affiche correctement
4. Vérifier que l'arborescence des fichiers montre la hiérarchie correctement
5. Essayer le Mode Récit depuis le sélecteur d'action
