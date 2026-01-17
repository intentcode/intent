---
id: "007"
from: HEAD
author: claude
date: 2025-01-14
status: active
risk: low
tags: [feature, i18n, parser]
files:
  - src/lib/parseIntentV2.ts
  - server/index.ts
  - src/App.tsx
---

# Multilingual Intent Content Support
# fr: Support du contenu multilingue des intents

## Summary
en: Added support for multilingual content in intent files. Intent titles, summaries, descriptions, and decisions can now include translations using language prefixes (en:, fr:, es:, de:). The parser extracts content for the requested language, falling back to English if not found.
fr: Ajout du support pour le contenu multilingue dans les fichiers intent. Les titres, résumés, descriptions et décisions peuvent maintenant inclure des traductions avec des préfixes de langue (en:, fr:, es:, de:). Le parser extrait le contenu pour la langue demandée, avec fallback vers l'anglais si non trouvé.

## Motivation
en: Intent files were previously monolingual. To support international teams and make code review accessible in multiple languages, the format now supports inline translations without requiring separate files per language.
fr: Les fichiers intent étaient auparavant monolingues. Pour supporter les équipes internationales et rendre la revue de code accessible en plusieurs langues, le format supporte maintenant les traductions inline sans nécessiter de fichiers séparés par langue.

## Chunks

### @function:extractLangContent | Language Content Extraction
### fr: Extraction du contenu par langue
en: Helper function that extracts content for a specific language from multilingual text. It scans lines for language prefixes (en:, fr:, etc.) and collects content for the requested language. Falls back to default language (English) if not found, or returns full text if no language prefixes are used.

Key behavior:
- Detects language prefixes at line start
- Collects subsequent lines until next language section
- Handles fallback gracefully

fr: Fonction helper qui extrait le contenu pour une langue spécifique depuis du texte multilingue. Elle scanne les lignes pour les préfixes de langue (en:, fr:, etc.) et collecte le contenu pour la langue demandée. Fallback vers la langue par défaut (anglais) si non trouvé, ou retourne le texte complet si aucun préfixe de langue n'est utilisé.

Comportement clé :
- Détecte les préfixes de langue en début de ligne
- Collecte les lignes suivantes jusqu'à la prochaine section de langue
- Gère le fallback gracieusement

> Decision: Use line-by-line parsing rather than regex blocks to handle multi-paragraph content correctly
> fr: Utiliser le parsing ligne par ligne plutôt que des blocs regex pour gérer correctement le contenu multi-paragraphe

### @function:extractLangTitle | Title Language Extraction
### fr: Extraction du titre par langue
en: Extracts the title for a specific language. The format uses `# Title` followed optionally by `# fr: Titre traduit` on the next line. Returns the translated title if found, otherwise falls back to the main title.

fr: Extrait le titre pour une langue spécifique. Le format utilise `# Title` suivi optionnellement de `# fr: Titre traduit` sur la ligne suivante. Retourne le titre traduit si trouvé, sinon fallback vers le titre principal.

> Decision: Keep main title on first line (not prefixed) for backward compatibility with tools that parse markdown headers
> fr: Garder le titre principal sur la première ligne (sans préfixe) pour la compatibilité avec les outils qui parsent les headers markdown

### @function:parseChunk | Chunk Parsing with Language Support
### fr: Parsing des chunks avec support de langue
en: Extended chunk parsing to support multilingual content:
- Chunk titles: `### @anchor | Title` followed by `### fr: Titre`
- Descriptions: Lines with language prefixes
- Decisions: `> Decision: ...` followed by `> fr: ...`

The parser tracks current language context and only collects content for the requested language.

fr: Extension du parsing des chunks pour supporter le contenu multilingue :
- Titres de chunks : `### @anchor | Title` suivi de `### fr: Titre`
- Descriptions : Lignes avec préfixes de langue
- Décisions : `> Decision: ...` suivi de `> fr: ...`

Le parser suit le contexte de langue courant et ne collecte que le contenu pour la langue demandée.

> Decision: Decisions use both `> Decision:` (English) and `> fr:` patterns to allow clear separation of language versions
> fr: Les décisions utilisent les patterns `> Decision:` (anglais) et `> fr:` pour permettre une séparation claire des versions de langue

### @function:parseIntentV2 | Main Parser with Lang Parameter
### fr: Parser principal avec paramètre de langue
en: Added optional `lang` parameter to the main parser function. Defaults to 'en'. Passes language through to all extraction functions.

fr: Ajout du paramètre optionnel `lang` à la fonction principale du parser. Par défaut 'en'. Passe la langue à toutes les fonctions d'extraction.

@link @function:extractLangContent | Used for summary and motivation extraction
@link @function:parseChunk | Used for chunk parsing

### @pattern:lastBrowseParamsRef | Browse Mode Language Reload Fix
### fr: Fix du reload de langue en mode Browse
en: Added a ref to store browse mode parameters (repoPath, branch) so that changing language in browse mode correctly reloads the data with the new language. Previously only diff mode parameters were stored.

fr: Ajout d'un ref pour stocker les paramètres du mode browse (repoPath, branch) pour que le changement de langue en mode browse recharge correctement les données avec la nouvelle langue. Avant, seuls les paramètres du mode diff étaient stockés.

> Decision: Use separate refs for diff and browse params rather than a union type for clarity
> fr: Utiliser des refs séparés pour les params diff et browse plutôt qu'un type union pour la clarté

## Testing Notes
en: Test multilingual support by:
1. Load the slack-cleaner repo which has multilingual intents
2. Switch between EN and FR languages
3. Verify titles, summaries, and chunk content change

fr: Tester le support multilingue en :
1. Charger le repo slack-cleaner qui a des intents multilingues
2. Basculer entre les langues EN et FR
3. Vérifier que les titres, résumés et contenu des chunks changent
