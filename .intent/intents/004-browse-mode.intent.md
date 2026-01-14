---
id: "004"
from: "src/components/RepoSelector.tsx, src/App.tsx, server/index.ts"
date: 2025-01-14
status: active
risk: low
files:
  - src/components/RepoSelector.tsx
  - src/App.tsx
  - server/index.ts
  - src/lib/api.ts
---
# Browse Mode & Action Selector

## Summary
Added a browse mode to view a single branch with all its intents, separate from the compare mode that shows diffs between branches.

## Motivation
Users need to explore existing intents on a branch without comparing to another branch. The previous interface only supported diff comparison, making it impossible to simply browse documentation.

## Chunks

### @function:fetchBrowse | API function to load branch content
Fetches intents and file contents from a specific branch without comparison.

> Decision: Created a separate endpoint `/api/browse` rather than overloading `/api/diff` to keep concerns separated and simplify the server logic.

### @type:ActionMode | Browse vs Compare selection
Two clear actions: "browse" (single branch view) or "compare" (diff between two branches).

> Decision: Card-style UI with icons makes the choice obvious at a glance. "Browse a branch" vs "Compare branches" with visual indicators.

### @function:loadBrowse | App-level browse handler
Sets view mode to "browse" and loads all intents from the selected branch with full file contents for anchor resolution.

> Decision: In browse mode, show ALL intents regardless of what files changed (since there's no diff). This differs from compare mode which filters intents by changed files.
