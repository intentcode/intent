# Intent Format Specification v2

## Overview

Intent is a documentation layer that captures the **why** behind code changes. It's designed to:
- Be decoupled from git commits (can be added retroactively)
- Survive line number changes (semantic anchors)
- Detect staleness automatically (content hashes)
- Support multiple languages

## Directory Structure

```
project/
├── .intent/
│   ├── manifest.yaml           # Index of all intents
│   └── intents/
│       ├── 001-add-notes.intent.md
│       ├── 001-add-notes.intent.fr.md    # French version
│       └── 002-fix-duplicates.intent.md
├── src/
│   └── cleaner.py
```

## Manifest: `.intent/manifest.yaml`

```yaml
version: 2
default_lang: en
intents:
  - id: add-notes-feature
    file: 001-add-notes.intent.md
    status: active
  - id: fix-duplicates
    file: 002-fix-duplicates.intent.md
    status: active
  - id: old-feature
    file: 000-old.intent.md
    status: superseded
    superseded_by: add-notes-feature
```

## Intent File Structure

```markdown
---
id: add-notes-feature
from: abc123def           # Base commit (before changes)
author: claude
date: 2024-01-11
status: active            # active | superseded | archived
superseded_by: null       # ID of replacing intent
risk: low                 # low | medium | high
tags: [feature, notes]
files:
  - src/slack_cleaner/cleaner.py
  - src/slack_cleaner/config.py
---

# Add Claude Notes Feature

## Summary
Capture context from messages marked "claude note" before deletion.

## Motivation
Users want to preserve important information before automatic cleanup.

## Chunks

### @class:Note | Note Dataclass
<!-- hash: a1b2c3d4 -->
Structure to store captured notes with timestamp, marker, context, thread flag.
> Decision: Dataclass over dict for type safety

### @function:_capture_notes_from_messages | Capture Method
<!-- hash: e5f6g7h8 -->
Scans messages for "claude note" marker and captures surrounding context.
> Decision: 2 previous messages for context (enough to understand)
@link @function:_save_notes | Writes captured notes to file

### @pattern:self._notes: List[Note] = [] | Notes List Init
<!-- hash: i9j0k1l2 -->
Initialize empty list in __init__ to accumulate notes.

---
```

## Semantic Anchors

Instead of line numbers (`L14-21`), use semantic anchors that survive refactoring:

| Anchor Type | Syntax | Example |
|-------------|--------|---------|
| Class | `@class:ClassName` | `@class:Note` |
| Function/Method | `@function:func_name` | `@function:_capture_notes` |
| Pattern | `@pattern:code_snippet` | `@pattern:self._notes = []` |
| Line (fallback) | `@line:14-21` | `@line:14-21` |
| Block | `@block:start...end` | `@block:# START...# END` |

### Anchor Resolution

The app resolves anchors to actual line numbers at display time:

```typescript
resolveAnchor("@class:Note", fileContent)
// → { start: 14, end: 21 }

resolveAnchor("@function:_capture_notes", fileContent)
// → { start: 208, end: 251 }

resolveAnchor("@pattern:self._notes: List[Note] = []", fileContent)
// → { start: 41, end: 41 }
```

## Content Hashes for Staleness

Each chunk stores a hash of its content when written:

```markdown
### @class:Note | Note Dataclass
<!-- hash: a1b2c3d4 -->
```

The app computes current hash and compares:
- **Match** → Intent is fresh
- **Mismatch** → Warning: "Intent might be outdated"
- **Anchor not found** → Error: "Code was removed or renamed"

## Intent Validity

An intent is valid from its `from` commit until:
1. Another intent with a later `from` covers the same files
2. The intent is marked `status: superseded`
3. The referenced files are deleted

## Multi-Intent Display

When viewing a commit range with multiple intents:

```
┌─────────────────────────────────────────┐
│ Intent: add-notes-feature (abc123 →)    │
│ Status: active ✓                        │
├─────────────────────────────────────────┤
│ @class:Note                        L14  │
│ @function:_capture_notes          L208  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Intent: fix-duplicates (def456 →)       │
│ Status: active ✓                        │
├─────────────────────────────────────────┤
│ @function:_save_notes             L253  │
│ ⚠️ Hash mismatch - might be outdated    │
└─────────────────────────────────────────┘
```

## Links Between Chunks

Reference other chunks using semantic anchors:

```markdown
@link @function:_save_notes | Writes notes to markdown
@link @class:Settings#dry_run | Controls preview mode
@link config.py@pattern:dry_run: bool | Configuration field
```

## Language Support

Intent files can have language variants:
- `001-feature.intent.md` → Base (English)
- `001-feature.intent.fr.md` → French
- `001-feature.intent.es.md` → Spanish

The app loads the requested language, falling back to base.

## Workflow

### Creating an Intent

1. Note your current commit: `git log -1 --format=%H` → `abc123`
2. Make your code changes
3. Create intent file with `from: abc123`
4. Commit (code + intent together, or separately)

### Updating an Intent

- **Minor update**: Edit the existing intent, update hashes
- **Major change**: Create new intent, mark old as `superseded`

### Retroactive Documentation

1. Find the commit before the changes you want to document
2. Create intent with that `from` commit
3. The intent now covers all changes since that commit

## Parsing Rules

1. Frontmatter is YAML between `---` markers
2. Chunks start with `### @anchor | Title`
3. Hash comment: `<!-- hash: xxxx -->`
4. Decisions: `> Decision: ...`
5. Links: `@link @anchor | reason`
6. Intent ends with `---`
