---
id: "006"
from: "src/components/DiffViewer.tsx, src/App.tsx, src/App.css"
date: 2025-01-14
status: active
risk: low
files:
  - src/components/DiffViewer.tsx
  - src/App.tsx
  - src/App.css
---
# Deep Dive - Ask Claude Feature

## Summary
Added a button on each chunk to copy context for exploring with Claude (Claude Code or claude.ai).

## Motivation
When reviewing intents, users may want to understand a chunk better - why it was implemented this way, what alternatives existed, or clarify confusing parts. Instead of manually copying context, the "Ask Claude" button prepares a well-formatted prompt.

## Chunks

### @function:handleDeepDive | Generate and copy exploration prompt
Builds a markdown prompt with chunk context (anchor, description, decisions, source code) and copies to clipboard. Uses fallback for browsers without Clipboard API.

> Decision: Prompt starts with "Exploratory Parenthesis" disclaimer to tell the LLM this is a side exploration, not a new task. This prevents derailing ongoing work.

### @pattern:deep-dive-btn | Button styling
Subtle dashed border button that becomes solid blue on hover. Uses chat emoji (💬) to indicate conversation.

> Decision: Unobtrusive design that doesn't distract from the main content but is discoverable when needed.

### @pattern:toast-notification | Copy confirmation
Fixed-position toast at bottom of screen confirming the context was copied with instructions to paste in Claude.

> Decision: Toast disappears after 5 seconds. High z-index (99999) to ensure visibility above all other elements.

### @pattern:translations | Multilingual support
Full FR/EN translations for button, tooltip, toast messages, and all prompt text.

> Decision: Prompt language matches UI language so users get a native experience when pasting to Claude.
