/**
 * Intent Parser v2 - Parses the new intent format with semantic anchors
 */

export interface IntentFrontmatter {
  id: string;
  from: string; // Base commit hash
  author?: string;
  date?: string;
  status: 'active' | 'superseded' | 'archived';
  superseded_by?: string;
  risk?: 'low' | 'medium' | 'high';
  tags?: string[];
  files: string[];
}

export interface IntentChunk {
  anchor: string; // e.g., "@class:Note"
  title: string;
  storedHash?: string;
  description: string;
  decisions: string[];
  links: Array<{
    target: string; // e.g., "@function:_save_notes" or "config.py@pattern:dry_run"
    reason: string;
  }>;
}

export interface IntentV2 {
  frontmatter: IntentFrontmatter;
  title: string;
  summary: string;
  motivation?: string;
  chunks: IntentChunk[];
  raw: string;
}

/**
 * Parse YAML frontmatter
 */
function parseFrontmatter(content: string): { frontmatter: IntentFrontmatter; rest: string } | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const yamlContent = frontmatterMatch[1];
  const rest = frontmatterMatch[2];

  // Simple YAML parser for our use case
  const frontmatter: Record<string, unknown> = {};

  const lines = yamlContent.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];
  let inArray = false;

  for (const line of lines) {
    // Array item
    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      currentArray.push(value);
      continue;
    }

    // Save previous array if any
    if (inArray && currentKey) {
      frontmatter[currentKey] = currentArray;
      currentArray = [];
      inArray = false;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '' || value.startsWith('[')) {
        // Array starts
        inArray = true;
        if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array
          const items = value.slice(1, -1).split(',').map(s => s.trim());
          frontmatter[currentKey] = items;
          inArray = false;
        }
      } else {
        frontmatter[currentKey] = value;
      }
    }
  }

  // Save last array if any
  if (inArray && currentKey) {
    frontmatter[currentKey] = currentArray;
  }

  return {
    frontmatter: frontmatter as unknown as IntentFrontmatter,
    rest,
  };
}

/**
 * Parse a single chunk
 */
function parseChunk(content: string): IntentChunk | null {
  const lines = content.split('\n');
  if (lines.length === 0) return null;

  // Parse header: ### @anchor | Title
  const headerMatch = lines[0].match(/^###\s+(@\w+:[^\s|]+)\s*\|\s*(.+)$/);
  if (!headerMatch) return null;

  const anchor = headerMatch[1];
  const title = headerMatch[2].trim();

  let storedHash: string | undefined;
  let description = '';
  const decisions: string[] = [];
  const links: Array<{ target: string; reason: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Hash comment: <!-- hash: xxxx -->
    const hashMatch = line.match(/<!--\s*hash:\s*(\w+)\s*-->/);
    if (hashMatch) {
      storedHash = hashMatch[1];
      continue;
    }

    // Decision: > Decision: ...
    const decisionMatch = line.match(/^>\s*Decision:\s*(.+)$/);
    if (decisionMatch) {
      decisions.push(decisionMatch[1]);
      continue;
    }

    // Link: @link @target | reason
    const linkMatch = line.match(/^@link\s+(@?[^\s|]+)\s*\|\s*(.+)$/);
    if (linkMatch) {
      links.push({
        target: linkMatch[1],
        reason: linkMatch[2].trim(),
      });
      continue;
    }

    // Regular description line
    if (line.trim() && !line.startsWith('#')) {
      if (description) description += '\n';
      description += line;
    }
  }

  return {
    anchor,
    title,
    storedHash,
    description: description.trim(),
    decisions,
    links,
  };
}

/**
 * Parse intent v2 file content
 */
export function parseIntentV2(content: string): IntentV2 | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const { frontmatter, rest } = parsed;

  // Parse title (# Title)
  const titleMatch = rest.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : '';

  // Parse summary (## Summary section)
  const summaryMatch = rest.match(/##\s+Summary\n([\s\S]*?)(?=\n##|\n---|\n###|$)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  // Parse motivation (## Motivation section)
  const motivationMatch = rest.match(/##\s+Motivation\n([\s\S]*?)(?=\n##|\n---|\n###|$)/);
  const motivation = motivationMatch ? motivationMatch[1].trim() : undefined;

  // Parse chunks (### @anchor | Title sections)
  const chunks: IntentChunk[] = [];
  const chunkPattern = /###\s+@\w+:[^\n]+[\s\S]*?(?=\n###|\n---|$)/g;
  const chunkMatches = rest.match(chunkPattern) || [];

  for (const chunkContent of chunkMatches) {
    const chunk = parseChunk(chunkContent);
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return {
    frontmatter,
    title,
    summary,
    motivation,
    chunks,
    raw: content,
  };
}

/**
 * Parse manifest.yaml
 */
export interface ManifestIntent {
  id: string;
  file: string;
  status: 'active' | 'superseded' | 'archived';
  superseded_by?: string;
}

export interface Manifest {
  version: number;
  default_lang: string;
  intents: ManifestIntent[];
}

export function parseManifest(content: string): Manifest | null {
  try {
    const lines = content.split('\n');
    const manifest: Manifest = {
      version: 1,
      default_lang: 'en',
      intents: [],
    };

    let inIntents = false;
    let currentIntent: Partial<ManifestIntent> = {};

    for (const line of lines) {
      if (line.match(/^version:\s*(\d+)/)) {
        manifest.version = parseInt(line.match(/^version:\s*(\d+)/)![1], 10);
      } else if (line.match(/^default_lang:\s*(\w+)/)) {
        manifest.default_lang = line.match(/^default_lang:\s*(\w+)/)![1];
      } else if (line.trim() === 'intents:') {
        inIntents = true;
      } else if (inIntents) {
        const idMatch = line.match(/^\s+-\s+id:\s*(.+)/);
        const fileMatch = line.match(/^\s+file:\s*(.+)/);
        const statusMatch = line.match(/^\s+status:\s*(.+)/);
        const supersededMatch = line.match(/^\s+superseded_by:\s*(.+)/);

        if (idMatch) {
          if (currentIntent.id) {
            manifest.intents.push(currentIntent as ManifestIntent);
          }
          currentIntent = { id: idMatch[1].trim() };
        } else if (fileMatch) {
          currentIntent.file = fileMatch[1].trim();
        } else if (statusMatch) {
          currentIntent.status = statusMatch[1].trim() as ManifestIntent['status'];
        } else if (supersededMatch) {
          currentIntent.superseded_by = supersededMatch[1].trim();
        }
      }
    }

    // Push last intent
    if (currentIntent.id) {
      manifest.intents.push(currentIntent as ManifestIntent);
    }

    return manifest;
  } catch {
    return null;
  }
}
