---
id: "009"
from: claude
date: 2025-01-16
status: active
risk: medium
tags: [feature, ux, diff]
files:
  - src/App.tsx
  - server/index.ts
  - src/lib/parseDiff.ts
---

# Virtual Hunks for Context Chunks

## Summary
When an intent has multiple chunks but only some are visible in the diff, we now display ALL chunks from that intent. Chunks not in the diff are shown as "virtual hunks" with context lines, allowing reviewers to understand the full context without switching to browse mode.

## Motivation
Previously, if an intent documented 3 functions but only 1 was modified in a PR, reviewers would only see 1 chunk. The other 2 chunks were filtered out because their code wasn't in the diff. This made it hard to understand the full picture of what the intent was documenting. Now, we show all chunks from relevant intents, with context chunks displayed alongside the actual diff.

## Chunks

### @function:isRangeInDiff | Check if chunk is in diff

Helper function that determines whether a chunk's line range overlaps with any hunk in the diff. It iterates through all hunks and their lines to check if any diff line falls within the chunk's range.

Returns `true` if the chunk is directly visible in the diff, `false` if it's a context chunk that needs a virtual hunk.

> Decision: Check by line range overlap, not exact match - a chunk spanning lines 10-20 should match if line 15 is in the diff

### @function:virtualHunksMap | Create virtual hunks for context chunks

This useMemo creates virtual hunks for chunks that are NOT in the diff but whose intent IS being displayed. For each context chunk:

1. Gets the file content from `allFileContents`
2. Extracts the chunk's code lines plus 10 lines of context above/below
3. Creates a `DiffHunk` with all lines marked as "context" (no +/-)
4. Marks the hunk with `isVirtual: true` for potential styling

The result is a map of filePath -> array of virtual hunks.

> Decision: 10 lines of context provides enough surrounding code to understand the chunk
> Decision: Mark hunks as virtual for future styling needs, though currently they look identical to regular context

### @function:filesWithVirtualHunks | Merge virtual hunks into files

Merges virtual hunks into the file list without mutating the original state. For each file:

1. Checks if there are virtual hunks for that file
2. If yes, creates a new file object with merged hunks (sorted by line number)
3. If virtual hunks reference files not in the diff, creates new FileData entries

This allows context chunks to appear in their correct position within the file's diff view.

> Decision: Create new objects instead of mutating to respect React's immutability patterns
> Decision: Sort hunks by startLineNew to ensure correct visual ordering

### @pattern:fileContents | Server returns file contents for virtual hunks

Modified all diff endpoints (`/api/diff`, `/api/github-pr`, `/api/github-branches-diff`) to return file contents for files referenced by intents, not just files in the diff.

This enables the frontend to create virtual hunks for context chunks without additional API calls.

> Decision: Load all intent-referenced files upfront to avoid lazy loading complexity
> Decision: Store in `allFileContents` state separately from individual file's `fullFileContent`
