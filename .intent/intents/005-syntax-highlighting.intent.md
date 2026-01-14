---
id: "005"
from: "src/components/DiffViewer.tsx, src/App.css"
date: 2025-01-14
status: active
risk: low
files:
  - src/components/DiffViewer.tsx
  - src/App.css
---
# Syntax Highlighting with Prism.js

## Summary
Added syntax highlighting to code display using Prism.js for better readability.

## Motivation
Raw code without syntax highlighting is hard to read on a web interface. Colors help distinguish keywords, strings, comments, and other language constructs.

## Chunks

### @function:detectLanguage | File extension to language mapping
Maps file extensions (.py, .ts, .tsx, .js, etc.) to Prism language identifiers.

> Decision: Simple extension-based detection is sufficient for now. Could add shebang detection or content analysis later if needed.

### @function:highlightLine | Prism-based line highlighting
Uses Prism.highlight() to tokenize and colorize individual lines of code.

> Decision: Highlight line-by-line rather than the whole file to preserve the diff line structure. Fallback to HTML-escaped plain text if grammar not found.

### @pattern:token styles | GitHub-inspired color scheme
CSS styles for Prism tokens matching GitHub's dark theme: keywords (red), functions (purple), strings (blue), comments (gray italic).

> Decision: GitHub dark theme colors are familiar to most developers and work well on the dark background.
