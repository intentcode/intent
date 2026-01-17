# Intent

**Intent-based code review tool** - Shows the "why" behind code changes, not just the "what".

## What is Intent?

Intent helps code reviewers understand the reasoning behind changes. Instead of just seeing `+/-` diffs, reviewers see:

- **Chunks**: Grouped changes with titles and descriptions
- **Decisions**: Rationale behind implementation choices
- **Semantic Anchors**: Code locations that persist across refactoring

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev:all

# Or start separately
npm run dev      # Frontend on http://localhost:5173
npm run server   # Backend on http://localhost:3001
```

## When to Write Intents

Intents are **recommended but not required**. The goal is to encourage documentation without creating friction.

| Change Type | Intent? | Why |
|-------------|---------|-----|
| New feature | Yes | Explain architecture decisions, trade-offs |
| Refactoring | Yes | Document why the new structure is better |
| Complex bug fix | Yes | Explain root cause and solution |
| Typo / small fix | No | Self-explanatory from the diff |
| Dependency updates | No | Usually no design decisions |
| Code formatting | No | No logic changes |

**Key principles:**
- PRs without intents are not blocked
- The app shows a helpful banner when no intents exist
- Teams can define their own policies

## Viewing Modes

### Display Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Diff** | Shows only changed lines with +/- markers | Code review, PR review |
| **Browse** | Shows full file content | Exploring documented code |
| **Story** | Read intents as narrative without code | Understanding project history |

### Data Sources

Intent supports multiple ways to load code:

| Source | URL Pattern | Description |
|--------|-------------|-------------|
| **GitHub PR** | `/:owner/:repo/pull/:number` | Review a pull request |
| **GitHub Branches** | `/:owner/:repo/compare/:base...:head` | Compare two branches |
| **GitHub Browse** | `/:owner/:repo/tree/:branch` | Browse a branch |
| **Local Repo** | Via RepoSelector | Compare local branches |

### Virtual Hunks (Context Chunks)

When an intent has multiple chunks but only some are in the diff, Intent displays **all chunks** from that intent:

- **In-diff chunks**: Shown with normal diff styling (+/- markers)
- **Context chunks**: Shown without +/- markers, with 10 lines of surrounding context

This helps reviewers understand the full context of changes without switching to browse mode.

## Creating Intents

Create a `.intent/` folder at your repo root:

```
.intent/
├── manifest.yaml           # Lists all intent files
└── intents/
    ├── 001-feature.intent.md
    └── 002-bugfix.intent.md
```

### manifest.yaml

```yaml
version: 1
default_lang: en
intents:
  - id: feature-auth
    file: 001-auth.intent.md
    status: active
```

### Intent File Format

```markdown
---
id: feature-auth
from: abc123
author: your-name
date: 2024-01-15
status: active
risk: medium
tags: [feature, auth]
files:
  - src/auth.ts
  - src/login.ts
---

# User Authentication System

## Summary
en: Added JWT-based authentication with refresh tokens.
fr: Ajout de l'authentification JWT avec tokens de rafraîchissement.

## Motivation
en: The app needed secure user sessions without server-side state.

## Chunks

### @function:authenticate | Authentication Logic
en: Validates credentials and generates JWT tokens.

Key points:
- Uses bcrypt for password hashing
- Tokens expire after 15 minutes

> Decision: Chose JWT over sessions for horizontal scaling
```

## Semantic Anchors

Anchors link documentation to code locations that survive refactoring:

| Anchor | Example | Use Case |
|--------|---------|----------|
| `@function:name` | `@function:authenticate` | Function/method |
| `@class:Name` | `@class:AuthService` | Class definition |
| `@method:Class.method` | `@method:AuthService.login` | Specific method |
| `@pattern:text` | `@pattern:if __name__` | Code pattern |
| `@chunk:id` | `@chunk:overview` | Conceptual (no code) |

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js / Vercel Serverless
- **Styling**: Custom CSS (GitHub dark theme)
- **Languages**: English, French, Spanish, German
- **Auth**: GitHub OAuth

## Authentication

Intent uses GitHub OAuth to access private repositories. Public repos work without login.

- **GitHub OAuth App**: https://github.com/settings/applications/3342234
- **Documentation**: [docs/authentication.md](docs/authentication.md)

## License

MIT
