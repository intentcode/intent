import { describe, it, expect } from 'vitest'
import { parseIntentV2, parseManifest } from './parseIntentV2'

describe('parseIntentV2', () => {
  describe('frontmatter parsing', () => {
    it('should parse basic frontmatter', () => {
      const content = `---
id: test-intent
from: abc1234
author: claude
date: 2024-01-11
status: active
risk: low
tags: [feature, notes]
files:
  - src/main.py
---

# Test Intent

## Summary
This is a test summary.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.frontmatter.id).toBe('test-intent')
      expect(result!.frontmatter.from).toBe('abc1234')
      expect(result!.frontmatter.author).toBe('claude')
      expect(result!.frontmatter.date).toBe('2024-01-11')
      expect(result!.frontmatter.status).toBe('active')
      expect(result!.frontmatter.risk).toBe('low')
      expect(result!.frontmatter.tags).toEqual(['feature', 'notes'])
      expect(result!.frontmatter.files).toEqual(['src/main.py'])
    })

    it('should parse multiline files array', () => {
      const content = `---
id: multi-file
from: def5678
status: active
files:
  - src/file1.py
  - src/file2.py
  - src/file3.py
---

# Multi File Intent

## Summary
Testing multiple files.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.frontmatter.files).toEqual([
        'src/file1.py',
        'src/file2.py',
        'src/file3.py'
      ])
    })

    it('should return null for content without frontmatter', () => {
      const content = `# Just a Title

Some content without frontmatter.
`
      const result = parseIntentV2(content)
      expect(result).toBeNull()
    })

    it('should handle superseded status', () => {
      const content = `---
id: old-intent
from: xyz9999
status: superseded
superseded_by: new-intent
files:
  - src/old.py
---

# Old Intent

## Summary
This intent is superseded.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.frontmatter.status).toBe('superseded')
      expect(result!.frontmatter.superseded_by).toBe('new-intent')
    })
  })

  describe('content parsing', () => {
    it('should parse title from H1', () => {
      const content = `---
id: title-test
from: abc123
status: active
files:
  - test.py
---

# My Awesome Feature

## Summary
A summary here.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.title).toBe('My Awesome Feature')
    })

    it('should parse summary section', () => {
      const content = `---
id: summary-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
This is a multi-line
summary that spans
multiple lines.

## Motivation
Something else.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.summary).toBe('This is a multi-line\nsummary that spans\nmultiple lines.')
    })

    it('should parse motivation section', () => {
      const content = `---
id: motivation-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Short summary.

## Motivation
Users need this feature because
it solves a real problem.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.motivation).toBe('Users need this feature because\nit solves a real problem.')
    })
  })

  describe('chunk parsing', () => {
    it('should parse a basic chunk with anchor and title', () => {
      const content = `---
id: chunk-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Testing chunks.

### @class:MyClass | My Class Implementation
This is the description of the class.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(1)
      expect(result!.chunks[0].anchor).toBe('@class:MyClass')
      expect(result!.chunks[0].title).toBe('My Class Implementation')
      expect(result!.chunks[0].description).toBe('This is the description of the class.')
    })

    it('should parse chunk with stored hash', () => {
      const content = `---
id: hash-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Testing hash.

### @function:process_data | Data Processor
<!-- hash: a1b2c3d4 -->
Processes incoming data efficiently.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(1)
      expect(result!.chunks[0].storedHash).toBe('a1b2c3d4')
      expect(result!.chunks[0].description).toBe('Processes incoming data efficiently.')
    })

    it('should parse chunk with decisions', () => {
      const content = `---
id: decision-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Testing decisions.

### @class:Config | Configuration Class
Configuration management class.
> Decision: Use dataclass for type safety
> Decision: Make fields immutable
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(1)
      expect(result!.chunks[0].decisions).toEqual([
        'Use dataclass for type safety',
        'Make fields immutable'
      ])
    })

    it('should parse chunk with links', () => {
      const content = `---
id: link-test
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Testing links.

### @function:save_data | Save Function
Saves data to storage.
@link @class:Storage | Uses storage class
@link config.py@pattern:dry_run | Checks dry run mode
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(1)
      expect(result!.chunks[0].links).toHaveLength(2)
      expect(result!.chunks[0].links[0]).toEqual({
        target: '@class:Storage',
        reason: 'Uses storage class'
      })
      expect(result!.chunks[0].links[1]).toEqual({
        target: 'config.py@pattern:dry_run',
        reason: 'Checks dry run mode'
      })
    })

    it('should parse multiple chunks', () => {
      const content = `---
id: multi-chunk
from: abc123
status: active
files:
  - test.py
---

# Test Intent

## Summary
Multiple chunks test.

### @class:First | First Class
Description of first class.
> Decision: First decision

### @function:second | Second Function
Description of second function.
> Decision: Second decision

### @pattern:CONSTANT | Third Pattern
Description of pattern.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(3)
      expect(result!.chunks[0].anchor).toBe('@class:First')
      expect(result!.chunks[1].anchor).toBe('@function:second')
      expect(result!.chunks[2].anchor).toBe('@pattern:CONSTANT')
    })

    it('should parse function anchor type', () => {
      const content = `---
id: func-test
from: abc123
status: active
files:
  - test.py
---

# Test

## Summary
Test.

### @function:my_func | My Function
A function.
`
      const result = parseIntentV2(content)
      expect(result!.chunks[0].anchor).toBe('@function:my_func')
    })

    it('should parse pattern anchor type', () => {
      const content = `---
id: pattern-test
from: abc123
status: active
files:
  - test.py
---

# Test

## Summary
Test.

### @pattern:self._notes | Notes Init
Initializes notes list.
`
      const result = parseIntentV2(content)
      expect(result!.chunks[0].anchor).toBe('@pattern:self._notes')
    })

    it('should parse line anchor type', () => {
      const content = `---
id: line-test
from: abc123
status: active
files:
  - test.py
---

# Test

## Summary
Test.

### @line:14-21 | Important Block
Lines 14 to 21.
`
      const result = parseIntentV2(content)
      expect(result!.chunks[0].anchor).toBe('@line:14-21')
    })
  })

  describe('raw content preservation', () => {
    it('should preserve raw content', () => {
      const content = `---
id: raw-test
from: abc123
status: active
files:
  - test.py
---

# Raw Test

## Summary
Testing raw preservation.
`
      const result = parseIntentV2(content)

      expect(result).not.toBeNull()
      expect(result!.raw).toBe(content)
    })
  })
})

describe('parseManifest', () => {
  it('should parse basic manifest', () => {
    const content = `version: 2
default_lang: en
intents:
  - id: first-intent
    file: 001-first.intent.md
    status: active
  - id: second-intent
    file: 002-second.intent.md
    status: active
`
    const result = parseManifest(content)

    expect(result).not.toBeNull()
    expect(result!.version).toBe(2)
    expect(result!.default_lang).toBe('en')
    expect(result!.intents).toHaveLength(2)
    expect(result!.intents[0].id).toBe('first-intent')
    expect(result!.intents[0].file).toBe('001-first.intent.md')
    expect(result!.intents[0].status).toBe('active')
  })

  it('should parse manifest with superseded intent', () => {
    const content = `version: 2
default_lang: fr
intents:
  - id: old-intent
    file: 001-old.intent.md
    status: superseded
    superseded_by: new-intent
  - id: new-intent
    file: 002-new.intent.md
    status: active
`
    const result = parseManifest(content)

    expect(result).not.toBeNull()
    expect(result!.default_lang).toBe('fr')
    expect(result!.intents[0].status).toBe('superseded')
    expect(result!.intents[0].superseded_by).toBe('new-intent')
    expect(result!.intents[1].status).toBe('active')
  })

  it('should handle empty intents list', () => {
    const content = `version: 1
default_lang: en
intents:
`
    const result = parseManifest(content)

    expect(result).not.toBeNull()
    expect(result!.intents).toHaveLength(0)
  })
})
