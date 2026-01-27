import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  detectOverlaps,
  loadLocalManifest,
  loadLocalIntents,
  loadLocalFileContent,
  resolveLocalAnchors,
  applyOverlaps,
  type ChunkWithFile,
  type ResolvedIntent,
} from '../intentLoader'
import * as fs from 'fs'
import * as path from 'path'

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

describe('detectOverlaps', () => {
  it('should detect overlapping chunks in the same file', () => {
    const chunks: ChunkWithFile[] = [
      {
        anchor: '@function:foo',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 1, endLine: 10 },
      },
      {
        anchor: '@function:bar',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 5, endLine: 15 },
      },
    ]

    const overlaps = detectOverlaps(chunks)

    expect(overlaps.get('@function:foo')).toContain('@function:bar')
    expect(overlaps.get('@function:bar')).toContain('@function:foo')
  })

  it('should not detect overlaps for non-overlapping chunks', () => {
    const chunks: ChunkWithFile[] = [
      {
        anchor: '@function:foo',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 1, endLine: 10 },
      },
      {
        anchor: '@function:bar',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 15, endLine: 25 },
      },
    ]

    const overlaps = detectOverlaps(chunks)

    expect(overlaps.get('@function:foo')).toBeUndefined()
    expect(overlaps.get('@function:bar')).toBeUndefined()
  })

  it('should not detect overlaps for chunks in different files', () => {
    const chunks: ChunkWithFile[] = [
      {
        anchor: '@function:foo',
        resolvedFile: 'src/a.ts',
        resolved: { startLine: 1, endLine: 10 },
      },
      {
        anchor: '@function:bar',
        resolvedFile: 'src/b.ts',
        resolved: { startLine: 5, endLine: 15 },
      },
    ]

    const overlaps = detectOverlaps(chunks)

    expect(overlaps.get('@function:foo')).toBeUndefined()
    expect(overlaps.get('@function:bar')).toBeUndefined()
  })

  it('should handle chunks without resolved location', () => {
    const chunks: ChunkWithFile[] = [
      {
        anchor: '@function:foo',
        resolvedFile: null,
        resolved: null,
      },
      {
        anchor: '@function:bar',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 5, endLine: 15 },
      },
    ]

    const overlaps = detectOverlaps(chunks)

    expect(overlaps.size).toBe(0)
  })

  it('should detect multiple overlaps', () => {
    const chunks: ChunkWithFile[] = [
      {
        anchor: '@function:a',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 1, endLine: 20 },
      },
      {
        anchor: '@function:b',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 5, endLine: 10 },
      },
      {
        anchor: '@function:c',
        resolvedFile: 'src/test.ts',
        resolved: { startLine: 15, endLine: 25 },
      },
    ]

    const overlaps = detectOverlaps(chunks)

    // a overlaps with both b and c
    expect(overlaps.get('@function:a')).toContain('@function:b')
    expect(overlaps.get('@function:a')).toContain('@function:c')
    // b only overlaps with a
    expect(overlaps.get('@function:b')).toContain('@function:a')
    expect(overlaps.get('@function:b')).not.toContain('@function:c')
    // c overlaps with a
    expect(overlaps.get('@function:c')).toContain('@function:a')
  })
})

describe('loadLocalManifest', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should return null if manifest does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = loadLocalManifest('/fake/repo')

    expect(result).toBeNull()
  })

  it('should parse and return manifest if it exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(`version: 2
default_lang: en
intents:
  - id: feature-1
    file: 001-feature.intent.md
    status: active
`)

    const result = loadLocalManifest('/fake/repo')

    expect(result).not.toBeNull()
    expect(result!.version).toBe(2)
    expect(result!.default_lang).toBe('en')
    expect(result!.intents).toHaveLength(1)
    expect(result!.intents[0].id).toBe('feature-1')
    expect(result!.intents[0].status).toBe('active')
  })
})

describe('loadLocalIntents', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should load active intents from manifest', () => {
    const manifest = {
      version: 2,
      default_lang: 'en',
      intents: [
        { id: 'active-1', file: 'active.intent.md', status: 'active' as const },
        { id: 'draft-1', file: 'draft.intent.md', status: 'draft' as const },
      ],
    }

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p)
      return pathStr.includes('active.intent.md')
    })

    vi.mocked(fs.readFileSync).mockReturnValue(`---
id: active-1
files:
  - src/test.ts
---

# Test Feature

## Summary
en: Test summary

## Chunks

### @function:test | Test Function
en: Description
`)

    const result = loadLocalIntents('/fake/repo', manifest)

    expect(result).toHaveLength(1)
    expect(result[0].frontmatter.id).toBe('active-1')
  })

  it('should skip draft intents', () => {
    const manifest = {
      version: 2,
      default_lang: 'en',
      intents: [
        { id: 'draft-1', file: 'draft.intent.md', status: 'draft' as const },
      ],
    }

    const result = loadLocalIntents('/fake/repo', manifest)

    expect(result).toHaveLength(0)
  })

  it('should prefer language-specific intent file', () => {
    const manifest = {
      version: 2,
      default_lang: 'en',
      intents: [
        { id: 'feature-1', file: 'feature.intent.md', status: 'active' as const },
      ],
    }

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p)
      return pathStr.includes('feature.intent.fr.md') || pathStr.includes('feature.intent.md')
    })

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const pathStr = String(p)
      if (pathStr.includes('.fr.md')) {
        return `---
id: feature-1
files:
  - src/test.ts
---

# Fonctionnalité Test

## Summary
fr: Résumé en français

## Chunks

### @function:test | Test
fr: Description en français
`
      }
      return `---
id: feature-1
files:
  - src/test.ts
---

# Test Feature

## Summary
en: English summary

## Chunks

### @function:test | Test
en: English description
`
    })

    const result = loadLocalIntents('/fake/repo', manifest, 'fr')

    expect(result).toHaveLength(1)
    // Should have loaded from French file
  })
})

describe('loadLocalFileContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should return file content if exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('file content here')

    const result = loadLocalFileContent('/fake/repo', 'src/test.ts')

    expect(result).toBe('file content here')
  })

  it('should return null if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = loadLocalFileContent('/fake/repo', 'src/missing.ts')

    expect(result).toBeNull()
  })
})

describe('applyOverlaps', () => {
  it('should add overlaps info to resolved intents', () => {
    const intents: ResolvedIntent[] = [
      {
        frontmatter: {
          id: 'test',
          files: ['src/test.ts'],
          from: '',
          author: '',
          date: '',
          status: 'active',
          risk: 'low',
          tags: [],
        },
        title: 'Test',
        summary: 'Summary',
        motivation: 'Motivation',
        chunks: [],
        isNew: false,
        intentFilePath: '.intent/intents/test.intent.md',
        resolvedChunks: [
          {
            anchor: '@function:foo',
            title: 'Foo',
            description: 'Desc',
            decisions: [],
            links: [],
            resolved: { startLine: 1, endLine: 10, content: '', hash: 'abc', found: true },
            resolvedFile: 'src/test.ts',
            hashMatch: null,
          },
          {
            anchor: '@function:bar',
            title: 'Bar',
            description: 'Desc',
            decisions: [],
            links: [],
            resolved: { startLine: 5, endLine: 15, content: '', hash: 'def', found: true },
            resolvedFile: 'src/test.ts',
            hashMatch: null,
          },
        ],
      },
    ]

    const result = applyOverlaps(intents)

    expect(result[0].resolvedChunks[0].overlaps).toContain('@function:bar')
    expect(result[0].resolvedChunks[1].overlaps).toContain('@function:foo')
  })

  it('should handle empty intents array', () => {
    const result = applyOverlaps([])
    expect(result).toHaveLength(0)
  })

  it('should handle intents without overlaps', () => {
    const intents: ResolvedIntent[] = [
      {
        frontmatter: {
          id: 'test',
          files: ['src/test.ts'],
          from: '',
          author: '',
          date: '',
          status: 'active',
          risk: 'low',
          tags: [],
        },
        title: 'Test',
        summary: 'Summary',
        motivation: 'Motivation',
        chunks: [],
        isNew: false,
        intentFilePath: '.intent/intents/test.intent.md',
        resolvedChunks: [
          {
            anchor: '@function:foo',
            title: 'Foo',
            description: 'Desc',
            decisions: [],
            links: [],
            resolved: { startLine: 1, endLine: 5, content: '', hash: 'abc', found: true },
            resolvedFile: 'src/test.ts',
            hashMatch: null,
          },
          {
            anchor: '@function:bar',
            title: 'Bar',
            description: 'Desc',
            decisions: [],
            links: [],
            resolved: { startLine: 10, endLine: 15, content: '', hash: 'def', found: true },
            resolvedFile: 'src/test.ts',
            hashMatch: null,
          },
        ],
      },
    ]

    const result = applyOverlaps(intents)

    expect(result[0].resolvedChunks[0].overlaps).toBeUndefined()
    expect(result[0].resolvedChunks[1].overlaps).toBeUndefined()
  })
})
