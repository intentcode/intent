/**
 * Anchor Resolver - Resolves semantic anchors to line numbers
 *
 * Supported anchor types:
 * - @class:ClassName
 * - @function:func_name
 * - @pattern:code_snippet
 * - @line:14-21 (fallback)
 * - @block:START...END
 */

export interface AnchorResult {
  found: boolean;
  startLine: number;
  endLine: number;
  content: string;
  hash: string;
}

export interface ResolvedChunk {
  anchor: string;
  title: string;
  description: string;
  decisions: string[];
  links: string[];
  resolved: AnchorResult | null;
  hashMatch: boolean | null; // null if no stored hash, true/false for match
  storedHash?: string;
}

/**
 * Simple hash function for content comparison
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Find a class definition and its body
 */
function findClass(content: string, className: string): AnchorResult | null {
  const lines = content.split('\n');

  let startLine = -1;
  let indentLevel = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for @dataclass decorator
    if (line.trim() === '@dataclass' && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine.match(new RegExp(`^\\s*class\\s+${className}`))) {
        startLine = i;
        indentLevel = nextLine.search(/\S/);
        break;
      }
    }

    // Check for class definition
    const match = line.match(new RegExp(`^(\\s*)class\\s+${className}`));
    if (match) {
      startLine = i;
      indentLevel = match[1].length;
      break;
    }
  }

  if (startLine === -1) return null;

  // Find end of class (next line with same or less indentation, or EOF)
  let endLine = startLine;
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // Skip empty lines

    const currentIndent = line.search(/\S/);
    if (currentIndent !== -1 && currentIndent <= indentLevel) {
      break;
    }
    endLine = i;
  }

  const contentLines = lines.slice(startLine, endLine + 1);
  const contentStr = contentLines.join('\n');

  return {
    found: true,
    startLine: startLine + 1, // 1-indexed
    endLine: endLine + 1,
    content: contentStr,
    hash: simpleHash(contentStr),
  };
}

/**
 * Find a function/method definition and its body
 */
function findFunction(content: string, funcName: string): AnchorResult | null {
  const lines = content.split('\n');

  // Patterns to match:
  // - def func_name( or async def func_name( (Python)
  // - function func_name( or async function func_name( (JS)
  // - export function func_name( (JS/TS)
  // - export async function func_name( (JS/TS)
  // - const func_name = or let func_name = (arrow functions)
  // - func_name( (shorthand methods)
  const funcPatterns = [
    // Standard function declarations
    new RegExp(`^(\\s*)(export\\s+)?(async\\s+)?(def|function)\\s+${funcName}\\s*[\\(<]`),
    // Arrow functions: const/let funcName =
    new RegExp(`^(\\s*)(export\\s+)?(const|let|var)\\s+${funcName}\\s*=`),
    // Shorthand methods: funcName(
    new RegExp(`^(\\s*)${funcName}\\s*\\(`),
  ];

  let startLine = -1;
  let indentLevel = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of funcPatterns) {
      const match = line.match(pattern);
      if (match) {
        startLine = i;
        indentLevel = match[1].length;
        break;
      }
    }
    if (startLine !== -1) break;
  }

  if (startLine === -1) return null;

  // Find end of function
  let endLine = startLine;
  let braceCount = 0;
  let inFunction = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Count braces for JS/TS
    braceCount += (line.match(/\{/g) || []).length;
    braceCount -= (line.match(/\}/g) || []).length;

    if (braceCount > 0) inFunction = true;
    if (inFunction && braceCount === 0) {
      endLine = i;
      break;
    }

    // For Python, check indentation
    if (i > startLine && line.trim() !== '') {
      const currentIndent = line.search(/\S/);
      if (currentIndent !== -1 && currentIndent <= indentLevel) {
        endLine = i - 1;
        break;
      }
    }
    endLine = i;
  }

  const contentLines = lines.slice(startLine, endLine + 1);
  const contentStr = contentLines.join('\n');

  return {
    found: true,
    startLine: startLine + 1,
    endLine: endLine + 1,
    content: contentStr,
    hash: simpleHash(contentStr),
  };
}

/**
 * Find a specific code pattern
 */
function findPattern(content: string, pattern: string): AnchorResult | null {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) {
      return {
        found: true,
        startLine: i + 1,
        endLine: i + 1,
        content: lines[i],
        hash: simpleHash(lines[i]),
      };
    }
  }

  return null;
}

/**
 * Parse line range anchor @line:14-21
 */
function parseLine(content: string, lineSpec: string): AnchorResult | null {
  const lines = content.split('\n');
  const match = lineSpec.match(/^(\d+)(?:-(\d+))?$/);

  if (!match) return null;

  const startLine = parseInt(match[1], 10);
  const endLine = match[2] ? parseInt(match[2], 10) : startLine;

  if (startLine < 1 || endLine > lines.length) return null;

  const contentLines = lines.slice(startLine - 1, endLine);
  const contentStr = contentLines.join('\n');

  return {
    found: true,
    startLine,
    endLine,
    content: contentStr,
    hash: simpleHash(contentStr),
  };
}

/**
 * Main anchor resolver
 */
export function resolveAnchor(anchor: string, fileContent: string): AnchorResult | null {
  // @class:ClassName
  if (anchor.startsWith('@class:')) {
    const className = anchor.substring(7);
    return findClass(fileContent, className);
  }

  // @function:func_name
  if (anchor.startsWith('@function:')) {
    const funcName = anchor.substring(10);
    return findFunction(fileContent, funcName);
  }

  // @pattern:code_snippet
  if (anchor.startsWith('@pattern:')) {
    const pattern = anchor.substring(9);
    return findPattern(fileContent, pattern);
  }

  // @line:14-21
  if (anchor.startsWith('@line:')) {
    const lineSpec = anchor.substring(6);
    return parseLine(fileContent, lineSpec);
  }

  return null;
}

/**
 * Resolve all chunks in an intent against file content
 */
export function resolveChunks(
  chunks: Array<{ anchor: string; title: string; description: string; decisions: string[]; links: string[]; storedHash?: string }>,
  fileContent: string
): ResolvedChunk[] {
  return chunks.map((chunk) => {
    const resolved = resolveAnchor(chunk.anchor, fileContent);
    let hashMatch: boolean | null = null;

    if (resolved && chunk.storedHash) {
      hashMatch = resolved.hash === chunk.storedHash;
    }

    return {
      ...chunk,
      resolved,
      hashMatch,
    };
  });
}
