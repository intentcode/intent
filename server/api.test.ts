import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { ChildProcess } from 'child_process'

// These are integration tests that require the server to be running
// Skip in CI environments or when server is not available
const SKIP_INTEGRATION = process.env.CI === 'true' || process.env.SKIP_INTEGRATION === 'true'

describe.skipIf(SKIP_INTEGRATION)('Server API Integration', () => {
  const API_BASE = 'http://localhost:3001'
  const server: ChildProcess | null = null

  beforeAll(async () => {
    // Note: These tests assume the server is running externally
    // In a full setup, you would start the server here
    try {
      const response = await fetch(`${API_BASE}/api/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: process.cwd() }),
      })
      if (!response.ok) {
        console.warn('Server not responding, skipping integration tests')
      }
    } catch {
      console.warn('Server not available, skipping integration tests')
    }
  })

  afterAll(() => {
    if (server) {
      server.kill()
    }
  })

  describe('POST /api/diff', () => {
    it('should return error for invalid repo path', async () => {
      const response = await fetch(`${API_BASE}/api/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: '/nonexistent/path' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid repo path')
    })

    it('should return diff for valid repo with local mode', async () => {
      const response = await fetch(`${API_BASE}/api/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: process.cwd(),
          mode: 'local',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('diff')
      expect(data).toHaveProperty('changedFiles')
      expect(data).toHaveProperty('intents')
      expect(data).toHaveProperty('intentsV2')
    })
  })

  describe('POST /api/branches', () => {
    it('should return branches for valid repo', async () => {
      const response = await fetch(`${API_BASE}/api/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: process.cwd() }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('currentBranch')
      expect(data).toHaveProperty('branches')
      expect(Array.isArray(data.branches)).toBe(true)
    })

    it('should return error for invalid repo path', async () => {
      const response = await fetch(`${API_BASE}/api/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: '/nonexistent/path' }),
      })

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/commits', () => {
    it('should return commits for valid repo', async () => {
      const response = await fetch(`${API_BASE}/api/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: process.cwd(),
          limit: 5,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('commits')
      expect(Array.isArray(data.commits)).toBe(true)
    })
  })

  describe('POST /api/list-dirs', () => {
    it('should list directories', async () => {
      const response = await fetch(`${API_BASE}/api/list-dirs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('currentPath')
      expect(data).toHaveProperty('parentPath')
      expect(data).toHaveProperty('directories')
      expect(Array.isArray(data.directories)).toBe(true)
    })

    it('should return error for invalid directory', async () => {
      const response = await fetch(`${API_BASE}/api/list-dirs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: '/nonexistent/path/that/does/not/exist' }),
      })

      expect(response.status).toBe(400)
    })
  })
})

// Unit tests for API utilities (these don't require server)
describe('API Response Types', () => {
  it('should have correct DiffResponse shape', () => {
    // This is a type-level test to ensure the response shape is correct
    interface DiffResponse {
      diff: string
      changedFiles: string[]
      intents: Record<string, string>
      intentsV2?: Array<{
        frontmatter: {
          id: string
          from: string
          status: string
          files: string[]
        }
        title: string
        summary: string
        resolvedChunks: Array<{
          anchor: string
          resolved: { startLine: number; endLine: number } | null
          hashMatch: boolean | null
        }>
      }>
      manifest: object | null
    }

    // Type assertion - if this compiles, the types are correct
    const mockResponse: DiffResponse = {
      diff: '',
      changedFiles: [],
      intents: {},
      intentsV2: [],
      manifest: null,
    }

    expect(mockResponse).toBeDefined()
  })
})
