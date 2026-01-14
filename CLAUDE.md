# Intent

Intent-based code review tool. Shows the "why" behind code changes, not just the "what".

## Project Overview

Intent is a React web app that displays code diffs alongside structured explanations (intents). Instead of reviewing raw +/- diffs, reviewers see:
- **Chunks**: Grouped changes with titles and descriptions
- **Decisions**: Rationale behind implementation choices
- **Links**: Connections between related code across files (`@link`)
- **Replaces**: What old code was removed and why (`@replaces`)

## Tech Stack

- React 18 + TypeScript
- Vite for dev/build
- Docker for containerized development
- Custom CSS (GitHub dark theme style)

## Project Structure

```
intentmd/
├── src/
│   ├── App.tsx              # Main app, example data, file tree
│   ├── App.css              # All styles
│   ├── components/
│   │   ├── DiffViewer.tsx   # Diff + aligned chunk cards
│   │   └── IntentViewer.tsx # (legacy) Intent-only view
│   └── lib/
│       ├── parseIntent.ts   # Parse .Intent format
│       └── parseDiff.ts     # Parse unified git diff
├── spec/
│   ├── intent-format.md     # Intent format specification
│   └── llm-prompt.md        # LLM prompt for generating intents
├── Dockerfile
├── Makefile
└── CLAUDE.md
```

## Commands

```bash
make dev    # Start dev server (http://localhost:5173)
make stop   # Stop dev server
make build  # Production build
make logs   # View container logs
```

## Intent File Format (.Intent)

```markdown
# filename.py

## 2024-01-11 14:30 | Session Title

### Recap
**Objectif:** What this change accomplishes
**Risque:** Risk level - explanation

### Chunks

#### L14-20 | Chunk Title
Description of what this code does and why.
> Décision: Rationale for a specific choice
@replaces L10-15 | What was removed and why
@link other_file.py#L30-35 | How this relates to other code

---
```

## Key Types

```typescript
interface Chunk {
  lineRange: string;      // "L14-20"
  startLine: number;
  endLine: number;
  title: string;
  description: string;
  decisions: Decision[];
  links: ChunkLink[];     // @link annotations
  replaces: ChunkReplaces[]; // @replaces annotations
}

interface ChunkLink {
  targetFile: string;     // "cleaner.py"
  targetRange: string;    // "L14-20"
  reason: string;
}

interface ChunkReplaces {
  oldRange: string;       // "L45-60" (old file lines)
  reason: string;
}
```

## Key Concepts

### Chunk Alignment
Chunk cards in the right panel are positioned absolutely to align with their corresponding code lines. `buildLineMap()` maps new file line numbers to rendered row indices.

### Links vs Replaces
- `@link file.py#L14-20 | reason` - References related code (blue, clickable)
- `@replaces L45-60 | reason` - Documents deletions (red, informational)

### Interactive Features
- Click chunk headers to expand/collapse details
- Click links to scroll and highlight target chunk
- Click files in sidebar to navigate to file section

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Intent | Intent-based code review                    │
├─────────────────────────────────────────────────────────┤
│ 2024-01-11 | Ajout feature claude note                  │
│ Objectif: ... | Risque: Faible | Fichiers: 3 modifiés   │
├──────────┬──────────────────────────────────────────────┤
│ Files    │ cleaner.py                                   │
│ ├ clean..│ ┌─────────────────┬──────────────────────┐   │
│ ├ config │ │ Diff (left)     │ Chunks (right)       │   │
│ └ notes..│ │ +@dataclass     │ L14-20 Dataclass ▶  │   │
│          │ │ +class Note:    │                      │   │
│          │ │ ...             │ L50-50 Init ▶       │   │
│          │ └─────────────────┴──────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

## Future Ideas

- [ ] Q&A per chunk (ask questions about specific code)
- [ ] Live AI chat with chunk context pre-loaded
- [ ] Generate intent files automatically from git commits
- [ ] Comment/discussion threads on chunks
- [ ] Highlight deleted lines when hovering @replaces
