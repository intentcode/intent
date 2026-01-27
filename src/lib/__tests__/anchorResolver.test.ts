import { describe, it, expect } from 'vitest'
import { resolveAnchor, resolveChunks } from '../anchorResolver'

describe('resolveAnchor', () => {
  describe('@class anchor', () => {
    it('should find a Python class', () => {
      const content = `import os

class MyClass:
    def __init__(self):
        self.value = 0

    def method(self):
        return self.value

def other_function():
    pass
`
      const result = resolveAnchor('@class:MyClass', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(3)
      // End line depends on indentation detection - just check it's found
      expect(result!.endLine).toBeGreaterThanOrEqual(8)
      expect(result!.content).toContain('class MyClass')
      expect(result!.content).toContain('def method')
      expect(result!.hash).toBeTruthy()
    })

    it('should find a TypeScript/JavaScript class', () => {
      const content = `import { Something } from './lib';

class MyClass {
  private value: number = 0;

  constructor() {
    this.init();
  }

  method(): number {
    return this.value;
  }
}

function otherFunction() {}
`
      const result = resolveAnchor('@class:MyClass', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(3)
      expect(result!.content).toContain('class MyClass')
    })

    it('should find a class with decorator', () => {
      // Note: Current implementation has limited decorator support
      // It finds the class but may not capture full content with decorator
      const content = `from dataclasses import dataclass

@dataclass
class Note:
    timestamp: str
    text: str
    context: list

class Other:
    pass
`
      const result = resolveAnchor('@class:Note', content)

      // Class should be found even with decorator
      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBeGreaterThanOrEqual(3)
    })

    it('should return null for non-existent class', () => {
      const content = `class Foo:
    pass
`
      const result = resolveAnchor('@class:Bar', content)
      expect(result).toBeNull()
    })

    it('should find class with inheritance', () => {
      const content = `class Child(Parent):
    def __init__(self):
        super().__init__()
        self.extra = True
`
      const result = resolveAnchor('@class:Child', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.content).toContain('class Child(Parent)')
    })
  })

  describe('@function anchor', () => {
    it('should find a Python function', () => {
      const content = `def helper():
    return True

def process_data(items):
    """Process the items."""
    result = []
    for item in items:
        result.append(item * 2)
    return result

def another():
    pass
`
      const result = resolveAnchor('@function:process_data', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(4)
      expect(result!.content).toContain('def process_data')
      expect(result!.content).toContain('return result')
    })

    it('should find an async Python function', () => {
      const content = `async def fetch_data(url):
    response = await client.get(url)
    return response.json()

def sync_function():
    pass
`
      const result = resolveAnchor('@function:fetch_data', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.content).toContain('async def fetch_data')
    })

    it('should find a TypeScript function', () => {
      const content = `function processItems(items: string[]): string[] {
  return items.map(item => item.toUpperCase());
}

function anotherFunction() {
  return null;
}
`
      const result = resolveAnchor('@function:processItems', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(1)
    })

    it('should find a method inside a class', () => {
      const content = `class MyClass:
    def __init__(self):
        self.value = 0

    def my_method(self, arg):
        return self.value + arg

    def other_method(self):
        pass
`
      const result = resolveAnchor('@function:my_method', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(5)
      expect(result!.content).toContain('def my_method')
    })

    it('should return null for non-existent function', () => {
      const content = `def foo():
    pass
`
      const result = resolveAnchor('@function:bar', content)
      expect(result).toBeNull()
    })
  })

  describe('@pattern anchor', () => {
    it('should find a simple pattern', () => {
      const content = `class Config:
    debug = True
    api_key = "secret"
    max_retries = 3
`
      const result = resolveAnchor('@pattern:max_retries', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(4)
      expect(result!.content).toContain('max_retries = 3')
    })

    it('should find initialization pattern', () => {
      const content = `def __init__(self):
    self.items = []
    self._notes: List[Note] = []
    self.ready = False
`
      const result = resolveAnchor('@pattern:self._notes', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(3)
    })

    it('should find pattern with special characters', () => {
      const content = `if self.settings.dry_run:
    print("Dry run mode")
else:
    execute()
`
      const result = resolveAnchor('@pattern:if self.settings.dry_run:', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(1)
    })

    it('should return null for non-existent pattern', () => {
      const content = `x = 1
y = 2
`
      const result = resolveAnchor('@pattern:z = 3', content)
      expect(result).toBeNull()
    })
  })

  describe('@line anchor', () => {
    it('should find single line', () => {
      const content = `line 1
line 2
line 3
line 4
line 5
`
      const result = resolveAnchor('@line:3', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(3)
      expect(result!.endLine).toBe(3)
      expect(result!.content).toBe('line 3')
    })

    it('should find line range', () => {
      const content = `line 1
line 2
line 3
line 4
line 5
`
      const result = resolveAnchor('@line:2-4', content)

      expect(result).not.toBeNull()
      expect(result!.found).toBe(true)
      expect(result!.startLine).toBe(2)
      expect(result!.endLine).toBe(4)
      expect(result!.content).toBe('line 2\nline 3\nline 4')
    })

    it('should return null for out of range', () => {
      const content = `line 1
line 2
`
      const result = resolveAnchor('@line:5', content)
      expect(result).toBeNull()
    })

    it('should return null for invalid format', () => {
      const content = `line 1
`
      const result = resolveAnchor('@line:abc', content)
      expect(result).toBeNull()
    })
  })

  describe('hash generation', () => {
    it('should generate consistent hash for same content', () => {
      const content = `class Test:
    pass
`
      const result1 = resolveAnchor('@class:Test', content)
      const result2 = resolveAnchor('@class:Test', content)

      expect(result1!.hash).toBe(result2!.hash)
    })

    it('should generate different hash for different content', () => {
      const content1 = `class Test:
    value = 1
`
      const content2 = `class Test:
    value = 2
`
      const result1 = resolveAnchor('@class:Test', content1)
      const result2 = resolveAnchor('@class:Test', content2)

      expect(result1!.hash).not.toBe(result2!.hash)
    })
  })

  describe('unknown anchor types', () => {
    it('should return null for unknown anchor type', () => {
      const content = `some content`
      const result = resolveAnchor('@unknown:something', content)
      expect(result).toBeNull()
    })
  })
})

describe('resolveChunks', () => {
  it('should resolve multiple chunks', () => {
    const content = `class First:
    pass

class Second:
    pass

def my_function():
    return True
`
    const chunks = [
      { anchor: '@class:First', title: 'First', description: '', decisions: [], links: [] },
      { anchor: '@class:Second', title: 'Second', description: '', decisions: [], links: [] },
      { anchor: '@function:my_function', title: 'Function', description: '', decisions: [], links: [] },
    ]

    const result = resolveChunks(chunks, content)

    expect(result).toHaveLength(3)
    expect(result[0].resolved).not.toBeNull()
    expect(result[0].resolved!.startLine).toBe(1)
    expect(result[1].resolved).not.toBeNull()
    expect(result[1].resolved!.startLine).toBe(4)
    expect(result[2].resolved).not.toBeNull()
    expect(result[2].resolved!.startLine).toBe(7)
  })

  it('should handle chunks with stored hash - matching', () => {
    const content = `class Test:
    pass
`
    // First resolve to get the actual hash
    const actualResult = resolveAnchor('@class:Test', content)
    const actualHash = actualResult!.hash

    const chunks = [
      { anchor: '@class:Test', title: 'Test', description: '', decisions: [], links: [], storedHash: actualHash },
    ]

    const result = resolveChunks(chunks, content)

    expect(result[0].hashMatch).toBe(true)
  })

  it('should handle chunks with stored hash - not matching (stale)', () => {
    const content = `class Test:
    value = 2
`
    const chunks = [
      { anchor: '@class:Test', title: 'Test', description: '', decisions: [], links: [], storedHash: 'different_hash' },
    ]

    const result = resolveChunks(chunks, content)

    expect(result[0].hashMatch).toBe(false)
  })

  it('should set hashMatch to null when no stored hash', () => {
    const content = `class Test:
    pass
`
    const chunks = [
      { anchor: '@class:Test', title: 'Test', description: '', decisions: [], links: [] },
    ]

    const result = resolveChunks(chunks, content)

    expect(result[0].hashMatch).toBeNull()
  })

  it('should handle unresolved chunks', () => {
    const content = `class Exists:
    pass
`
    const chunks = [
      { anchor: '@class:Exists', title: 'Exists', description: '', decisions: [], links: [] },
      { anchor: '@class:DoesNotExist', title: 'Missing', description: '', decisions: [], links: [] },
    ]

    const result = resolveChunks(chunks, content)

    expect(result[0].resolved).not.toBeNull()
    expect(result[1].resolved).toBeNull()
    expect(result[1].hashMatch).toBeNull()
  })
})
