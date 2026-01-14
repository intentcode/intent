---
id: "003"
from: berenger
date: 2024-01-13
status: active
risk: medium
tags: [core, parser, semantic]
files:
  - src/lib/anchorResolver.ts
  - src/lib/parseIntentV2.ts
---

# Semantic Anchor Resolution System

## Summary
The anchor resolver is a core system that converts semantic code references (like `@function:myFunc` or `@class:MyClass`) into actual line numbers and code content. This enables intent documentation to survive code refactoring - as long as the function/class name stays the same, the anchor will find the new location.

## Motivation
Traditional line-based documentation (`L14-21`) breaks when code is modified - adding a line shifts all subsequent references. Semantic anchors solve this by referencing code by its meaning (function name, class name, pattern) rather than location. The resolver dynamically finds the current position of referenced code, and detects when code has changed (staleness).

## Chunks

### @function:resolveAnchor | Main anchor resolution entry point

The main function that dispatches to specific resolvers based on anchor type. Supported anchor formats:

- `@function:funcName` - Finds function/method definitions (Python def, JS function, arrow functions)
- `@class:ClassName` - Finds class definitions (Python/JS/TS classes, including decorators)
- `@pattern:code_snippet` - Finds exact string matches in the code
- `@line:14-21` - Fallback to line-based references (legacy support)

Returns an `AnchorResult` with:
- `found`: boolean indicating if the anchor was resolved
- `startLine`/`endLine`: 1-indexed line numbers
- `content`: the matched code content
- `hash`: a hash of the content for staleness detection

> Decision: Use prefix-based dispatch (@function:, @class:, etc.) for clarity and extensibility
> Decision: Return null for unresolved anchors rather than throwing - allows graceful degradation

### @function:findFunction | Function/method finder

Finds function and method definitions across multiple languages and styles:

**Python**:
- `def func_name(...):`
- `async def func_name(...):`

**JavaScript/TypeScript**:
- `function funcName(...)`
- `async function funcName(...)`
- `export function funcName(...)`
- `export async function funcName(...)`
- `const funcName = ...` (arrow functions)
- `funcName(...)` (shorthand object methods)

The function uses regex patterns to match the declaration, then determines the end of the function by:
- **Brace counting** for JS/TS: tracks `{` and `}` to find the closing brace
- **Indentation** for Python: finds the next line with equal or less indentation

> Decision: Support multiple patterns with fallback to catch all common styles
> Decision: Use brace counting for JS (handles nested functions) and indentation for Python (standard for that language)
> Decision: Stop at first match to avoid ambiguity with overloaded names

### @function:findClass | Class definition finder

Finds class definitions including decorators:

**Patterns matched**:
- `class ClassName:` (Python)
- `class ClassName(BaseClass):` (Python with inheritance)
- `@dataclass class ClassName` (Python with decorator)
- `class ClassName {` (JS/TS)
- `class ClassName extends Base {` (JS/TS with inheritance)

For Python classes, the resolver includes the decorator if present (e.g., `@dataclass`). The class end is determined by indentation - the first line with equal or less indentation marks the end.

> Decision: Include decorators in class matches since they're semantically part of the class definition
> Decision: Use indentation-based end detection which works for both Python and properly formatted JS

### @function:simpleHash | Content hash for staleness detection

Generates a simple 8-character hash of code content. This hash is stored in intent files and compared against the current content to detect changes.

The hash algorithm:
1. Iterates through each character
2. Applies bit shifting and XOR operations
3. Converts to hex, truncated to 8 chars

The hash is intentionally simple (not cryptographic) because:
- We only need change detection, not security
- Fast computation matters for large codebases
- Collisions are acceptable (false negatives just mean manual review)

> Decision: Use simple hash rather than MD5/SHA for performance - we're detecting changes, not verifying integrity
> Decision: 8 characters provides enough uniqueness for practical purposes while keeping intent files readable

