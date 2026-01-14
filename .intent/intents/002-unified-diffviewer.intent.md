---
id: "002"
from: berenger
date: 2024-01-13
status: active
risk: low
tags: [feature, ui, refactor]
files:
  - src/components/DiffViewer.tsx
  - src/App.tsx
  - src/App.css
---

# Unified DiffViewer Design

## Summary
Unified design for code review view that works both with and without git diff. The same DiffViewer component handles both cases: showing diff lines when available, or showing resolved code from intent anchors when there's no diff (intents-only mode).

## Motivation
Previously, the intents-only mode (when there's no code diff but there are intents) had a completely different UI from the regular diff view. This created inconsistency, duplicated code, and a jarring user experience when switching between modes. The unified design provides the same experience regardless of whether there's a git diff, making the tool more intuitive and maintainable.

## Chunks

### @function:DiffViewer | Unified component for diff and intents-only modes

The DiffViewer component now handles two distinct modes with a single codebase:

**Diff mode** (`isDiffMode = true`):
- Triggered when `file` prop has hunks
- Shows diff lines with +/- indicators and color coding
- Supports expand context between hunks (like GitHub)
- Chunk cards are positioned to align with their corresponding code lines

**Intents-only mode** (`isIntentsOnly = true`):
- Triggered when `resolvedChunks` prop is provided without diff
- Shows resolved code sections from semantic anchors
- Each code section has a header showing the anchor type and line range
- Stale indicators show when code has changed since the intent was written

Both modes share the same two-column layout: code panel on the left, explanation panel on the right. Chunk cards are absolutely positioned but use smart overlap prevention.

> Decision: Use a single component with conditional rendering rather than two separate components - reduces code duplication and ensures consistent behavior
> Decision: Chunk cards are absolutely positioned to align with code, but with overlap prevention to ensure all cards are visible
> Decision: Use refs to measure actual card heights for accurate positioning calculations

### @function:calculatePositions | Smart non-overlapping chunk positioning

This function calculates the vertical position for each chunk card to prevent overlapping. The algorithm:

1. For each chunk, calculate the "ideal" position based on its corresponding code line
2. Compare with the bottom of the previous card (including any expansion)
3. If overlap would occur, push the card down below the previous one
4. Track actual card heights using refs for accurate calculations

The positioning updates dynamically when:
- A chunk is expanded/collapsed (height changes)
- The window is resized
- New chunks are loaded

This ensures cards never overlap even when multiple chunks are expanded simultaneously.

> Decision: Use `chunkHeights` state + refs to track real heights rather than estimating - more accurate but requires re-render after measurement
> Decision: Minimum gap of 8px between cards for visual breathing room

### @function:buildLineMaps | Maps line numbers to row positions

Builds maps from diff line numbers to rendered row indices. This is critical for positioning chunk cards correctly in diff mode where line numbers can be non-contiguous (due to hunks).

The function creates two maps:
- `newLineMap`: Maps new file line numbers to row index
- `oldLineMap`: Maps old file line numbers to row index (for deletions)

For addition chunks, we use newLineMap. For deletion chunks (prefixed with D), we use oldLineMap.

> Decision: Separate maps for old and new line numbers to handle additions and deletions correctly - a single map would fail for deletion-only chunks

### @function:toggleContext | Expand context between hunks

Enables the GitHub-style "show hidden lines" feature. When a diff has gaps between hunks (unexpanded context), users can click to reveal those lines.

The feature requires:
1. Backend to send `fileContents` with the full file content
2. Frontend to calculate gaps between hunks (`hunkGaps`)
3. Toggle state for each context section (`expandedContexts`)

Expanded context lines are styled differently (subtle blue tint) to distinguish them from actual diff lines.

> Decision: Only show expand button when `fullFileContent` is available - graceful degradation when backend doesn't provide it
> Decision: Show line count in button ("Show 15 lines") to help users decide whether to expand

