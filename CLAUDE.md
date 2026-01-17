# Intent

Intent-based code review tool. Shows the "why" behind code changes, not just the "what".

## Project Overview

Intent is a React web app that displays code diffs alongside structured explanations (intents). Instead of reviewing raw +/- diffs, reviewers see:
- **Chunks**: Grouped changes with titles and descriptions
- **Decisions**: Rationale behind implementation choices
- **Semantic Anchors**: Code locations that persist across refactoring

## Philosophy: When to Write Intents

Intents are **recommended but not required**. The goal is to encourage documentation without creating friction.

| Change Type | Intent Needed? | Reason |
|-------------|----------------|--------|
| New feature | ✅ Yes | Explain architecture decisions, trade-offs |
| Significant refactoring | ✅ Yes | Document why the new structure is better |
| Complex bug fix | ✅ Yes | Explain root cause and solution approach |
| Typo / small fix | ❌ No | Self-explanatory from the diff |
| Dependency updates | ❌ No | Usually no design decisions |
| Code formatting | ❌ No | No logic changes |

**Key principles:**
- PRs without intents should not be blocked
- The app shows a helpful banner when no intents exist, with a link to learn how to create them
- Project teams can decide their own policies (some may require intents for PRs > 3 files)

## Three Modes

1. **Compare (Diff) Mode**: Shows diff between two branches with aligned intent cards
2. **Browse Mode**: Shows full file content with all intents for a single branch
3. **Story Mode**: Narrative view of all intents without code - read intents as chapters

## Tech Stack

- React 18 + TypeScript + Vite (frontend on port 5173)
- Express.js backend (port 3001) / Vercel Serverless (production)
- Custom CSS (GitHub dark theme style)
- Multi-language support (en, fr, es, de)
- GitHub OAuth for private repo access

## Authentication

Intent uses GitHub OAuth for accessing private repositories. Public repos work without login.

- **GitHub OAuth App**: https://github.com/settings/applications/3342234
- **Auth endpoints**: `/api/auth/github`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`
- **Session**: JWT in httpOnly cookie (stateless, 7-day expiry)
- **Documentation**: [docs/authentication.md](docs/authentication.md)

## Project Structure

```
intent/
├── src/
│   ├── App.tsx              # Main app with modes and file tree
│   ├── App.css              # All styles
│   ├── components/
│   │   ├── DiffViewer.tsx   # Unified diff/browse viewer with chunk cards
│   │   └── RepoSelector.tsx # Repository and branch selection
│   └── lib/
│       ├── api.ts           # Backend API client
│       ├── parseDiff.ts     # Parse unified git diff
│       └── parseIntentV2.ts # Parse v2 intent format
├── server/
│   └── index.js             # Express backend for git operations
├── spec/
│   └── intent-format-v2.md  # Intent v2 format specification
└── CLAUDE.md
```

## Commands

```bash
npm run dev:all    # Start both frontend and backend
npm run dev        # Frontend only (port 5173)
npm run server     # Backend only (port 3001)
npm run build      # Production build
```

## Intent v2 Format

Intents are stored in a `.intent/` folder at repo root:

```
.intent/
├── manifest.yaml           # Lists all intent files
└── intents/
    ├── 001-feature.intent.md
    └── 002-bugfix.intent.md
```

### Intent File Structure

```markdown
---
id: feature-name
from: abc123
author: claude
date: 2024-01-11
status: active
risk: medium
tags: [feature, api]
files:
  - src/example.py
---

# Title of the change
# fr: Titre du changement

## Summary
en: English summary of what this change accomplishes.
fr: Résumé en français de ce que ce changement accomplit.

## Motivation
en: Why this change was needed.
fr: Pourquoi ce changement était nécessaire.

## Chunks

### @function:process_data | Data Processing
### fr: Traitement des données
en: Description of what this code does and why.

Key points:
- Point 1
- Point 2

fr: Description de ce que ce code fait et pourquoi.

Points clés :
- Point 1
- Point 2

> Decision: Rationale for a specific choice
> fr: Justification d'un choix spécifique

@link @function:validate_input | Uses validation logic
```

### Multilingual Format

Content supports inline translations with language prefixes:

- **Title**: `# Title` followed by `# fr: Titre traduit`
- **Sections**: Lines starting with `en:`, `fr:`, `es:`, `de:`
- **Chunk titles**: `### @anchor | Title` followed by `### fr: Titre`
- **Decisions**: `> Decision: ...` followed by `> fr: ...`

The parser extracts content for the requested language, falling back to English if not found. Content without language prefixes is treated as language-neutral.

## Semantic Anchors

Anchors locate code positions that survive refactoring. They're the key mechanism that makes intents resilient to code changes.

### Anchor Types

| Type | Syntax | Description | Robustness |
|------|--------|-------------|------------|
| Function | `@function:name` | Matches function/method definition | ⭐⭐⭐ High |
| Class | `@class:Name` | Matches class definition | ⭐⭐⭐ High |
| Method | `@method:Class.method` | Matches method in specific class | ⭐⭐⭐ High |
| Pattern | `@pattern:text` | Matches first line containing text | ⭐⭐ Medium |
| Line | `@line:14-20` | Explicit line range | ⭐ Low (fragile) |
| Chunk | `@chunk:id` | Virtual chunk, no code attached | N/A |

### Usage Examples

```markdown
## Chunks

### @function:process_data | Data Processing
Describes the process_data function.

### @class:DataProcessor | Data Processor Class
Describes the entire DataProcessor class.

### @method:DataProcessor.validate | Validation Method
Describes a specific method within a class.

### @pattern:if __name__ == | Entry Point
Describes the main entry point pattern.

### @line:1-10 | File Header
Describes the first 10 lines (fragile - avoid if possible).

### @chunk:architecture-overview | Architecture Overview
A conceptual chunk with no code attached - useful for high-level explanations.
```

### Anchor Resolution

The backend resolves anchors to actual line numbers:

1. **Function/Method**: Looks for `def name(`, `function name(`, `const name =` patterns
2. **Class**: Looks for `class Name` with proper indentation tracking
3. **Pattern**: Simple text search, returns first match
4. **Line**: Direct line range lookup
5. **Chunk**: Returns virtual result (no code location)

Each resolution includes:
- `startLine` / `endLine`: Line range in file
- `content`: The actual code content
- `hash`: Content hash for staleness detection

### Best Practices

1. **Prefer semantic anchors** (`@function`, `@class`) over `@line` - they survive refactoring
2. **Use `@pattern` sparingly** - only when function/class don't apply
3. **Use `@chunk` for conceptual content** - architecture decisions, trade-offs, etc.
4. **One chunk per concept** - don't over-anchor, focus on important code

## Chunk Links

Chunks can reference other chunks or code locations using the `@link` directive.

### Link Format

```markdown
@link @function:helper | Uses helper function
@link @chunk:overview | Related to overview
@link utils.py@function:parse | Uses parser from utils
```

### Link Types

| Type | Format | Icon | Description |
|------|--------|------|-------------|
| Internal | `@link @anchor` | ↓ | Same file, clickable |
| Cross-file | `@link file@anchor` | 📁 | Different file |
| Chunk ref | `@link @chunk:id` | 📎 | Reference to conceptual chunk |
| Unresolved | `@link @unknown` | ↗ | Target not found |

### Features

- **Internal links**: Click to jump to target chunk, hover to highlight code
- **Cross-file links**: Shows file badge, visual indicator
- **Chunk refs**: Purple styling for conceptual references

## Chunk Overlaps

When two or more chunks reference overlapping line ranges in the same file, they are marked as overlapping. This helps identify potential issues:

- **Same code, different descriptions**: May indicate redundant chunks
- **Partial overlaps**: May need better granularity

### Visual Indicators

- Purple border on chunk cards with overlaps
- "OVERLAP" badge in chunk header
- List of overlapping anchors in chunk body

### Detection Logic

Two chunks overlap if their resolved line ranges intersect:
```
chunk A: lines 10-20
chunk B: lines 15-25
→ Overlap detected (lines 15-20 are shared)
```

## Key Types

```typescript
interface ResolvedChunkAPI {
  anchor: string;           // "@function:process_data"
  title: string;
  description: string;
  decisions: string[];
  hashMatch: boolean | null; // true=fresh, false=stale, null=new
  resolved: {               // null if code no longer exists (obsolete)
    startLine: number;
    endLine: number;
    contentHash: string;
  } | null;
}
```

### Chunk States

- **Fresh** (`resolved !== null && hashMatch === true`): Code exists and matches stored hash
- **Stale** (`resolved !== null && hashMatch === false`): Code exists but has changed - chunk is still useful
- **Obsolete** (`resolved === null`): Code no longer exists - chunk should be reviewed/removed
- **New** (`resolved !== null && hashMatch === null`): New chunk, no stored hash yet

## API Endpoints

- `POST /api/diff` - Get diff between branches with resolved intents
- `POST /api/browse` - Get file content with resolved intents for single branch
- `POST /api/github/diff` - Same as /api/diff but for GitHub repos
- `POST /api/github/browse` - Same as /api/browse but for GitHub repos

## UI Layout

```
+----------------------------------------------------------+
| Intent | Intent-based code review              [EN] [FR]  |
+----------------------------------------------------------+
| [Browse] [Compare] [Story]   Repository: /path/to/repo   |
+----------------------------------------------------------+
| Files (tree)   | cleaner.py                              |
| 📁 src/        | +---------------------+----------------+ |
|   └── M app.py | | Diff/Code (left)    | Chunks (right)| |
| 📁 server/     | | +@dataclass         | [Chunk Card]  | |
|   └── + new.py | | +class Note:        |   title       | |
|----------------|                       |   description | |
| Intents (3)    |                       |   decisions   | |
| [#001 Feature] |                       |               | |
| [#002 Bugfix]  |                       | [Chunk Card]  | |
|                | +---------------------+----------------+ |
+----------------------------------------------------------+
```

### Sidebar Features

- **File Tree**: Hierarchical view with collapsed paths (src/components instead of src/ > components/)
- **Intent List**: Click to select an intent, shows stale/obsolete indicators
- **Selected Intent Header**: Displays full details of selected intent above code

## Done

- [x] New anchor types (@chunk:id, @method:Class.method)
- [x] Chunk links - reference other chunks or functions elsewhere in code
- [x] Chunk overlap detection and resolution

## Next Up

### Priorité Haute - UX File Tree
- [ ] **Collapsible file tree** - Flèches pour ouvrir/fermer les dossiers (style GitHub)
- [ ] Indicateurs de fichiers modifiés (M), ajoutés (+), supprimés (-)
- [ ] Compteur de fichiers par dossier
- [ ] Expand all / Collapse all buttons

### Amélirations UI
- [ ] Sticky header pour le fichier sélectionné
- [ ] Highlight du chunk actif dans la sidebar
- [ ] Scroll sync entre code et chunks
- [ ] Keyboard shortcuts (j/k pour naviguer les chunks)

### Intent Generation
- [ ] LLM prompt improvements pour génération d'intents
- [ ] Bouton "Generate Intent" depuis l'UI
- [ ] Template selector (feature, bugfix, refactor)
- [ ] Batch update stale chunk hashes

### Backend
- [ ] Cache des résolutions d'ancres
- [ ] Support Git LFS
- [ ] Pagination pour gros diffs

## Future Ideas

- [ ] Generate intent files automatically from git commits
- [ ] GitHub integration with token - view intents directly on GitHub
- [ ] Q&A per chunk (ask questions about specific code)
- [ ] VS Code extension
- [ ] GitHub App pour PR reviews

## Maybe Later

- [ ] Live AI chat with chunk context pre-loaded
- [ ] Diff between two intents (intent versioning)
- [ ] Intent templates marketplace
