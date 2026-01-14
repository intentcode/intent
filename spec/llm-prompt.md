# LLM Prompt for Generating Intent Files

Use this prompt (or add to your coding agent's system prompt) to generate intent.md files alongside code changes.

---

## System Prompt Addition

```
## Intent Documentation

When you make code changes, generate an intent.md file that explains the "why" behind your changes. This helps humans review and understand your work.

### Format

For each file you modify significantly, create or update a `<filename>.intent.md` file:

```markdown
# filename.py

## {DATE} {TIME} | {SHORT_TITLE}

### Recap
**Objectif:** {One sentence describing the goal}
**Risque:** {Low|Medium|High} - {Brief risk explanation}

### Chunks

#### L{start}-{end} | {Chunk Title}
{1-2 sentence description of what this code does}
> Decision: {Why you chose this approach over alternatives}
@replaces L{old_start}-{old_end} | {What was removed and why}
@link {other_file.py}#L{start}-{end} | {How this relates to other code}

#### D{start}-{end} | {Deletion Title}
{Explain why this code was removed}
> Decision: {Rationale for removal}

---
```

### Rules

1. **Line numbers matter**: Use actual line numbers from the final file
   - `L` prefix for new/modified lines (new file line numbers)
   - `D` prefix for deleted lines (old file line numbers)

2. **Be specific about decisions**: Don't just say what, explain why
   - BAD: "Added error handling"
   - GOOD: "Added try/catch because API can timeout under load"

3. **Link related code**: Help reviewers navigate
   - Link to code this depends on
   - Link to code that depends on this
   - Link to related tests

4. **Document deletions**: Explain why code was removed
   - Was it replaced? Link to replacement
   - Was it dead code? Explain how you verified
   - Was it buggy? Explain the bug

5. **Chunk granularity**:
   - One chunk per logical unit (5-30 lines typically)
   - Group related changes together
   - Separate chunks for unrelated changes in same file

### When to Generate Intent

Generate intent.md when:
- Adding new features
- Fixing non-trivial bugs
- Refactoring code
- Making architectural decisions
- Removing significant code

Skip intent.md for:
- Typo fixes
- Import sorting
- Pure formatting changes
- Trivial one-line fixes
```

---

## Example Prompt for One-Shot Generation

```
Based on the following git diff, generate an intent.md file that explains the changes:

<diff>
{paste diff here}
</diff>

Generate a {filename}.intent.md that:
1. Has a clear objective and risk assessment
2. Groups changes into logical chunks with line numbers
3. Explains decisions and trade-offs
4. Links related code across files
5. Documents any deletions with rationale
```

---

## Example Prompt for Interactive Session

```
I'm about to implement {feature description}.

As I write code, help me document the intent:
1. After each significant change, suggest an intent chunk
2. Prompt me to explain my decisions
3. Identify code that should be linked
4. Flag deletions that need documentation

Let's start. Here's my first change:
{code or diff}
```

---

## Validation Checklist

Before finalizing intent.md, verify:

- [ ] Line numbers match actual file
- [ ] Every chunk has a clear "why" not just "what"
- [ ] Deletions (D prefix) reference old file line numbers
- [ ] Links point to real code that exists
- [ ] Risk assessment is realistic
- [ ] Decisions mention alternatives considered
