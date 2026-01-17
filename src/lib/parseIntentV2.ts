/**
 * Intent Parser v2 - Parses the new intent format with semantic anchors
 * Supports multilingual content with lang prefixes (en:, fr:, etc.)
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
 * Extract content for a specific language from multilingual text
 * Format: lines starting with "en:", "fr:", etc.
 * Falls back to content without prefix if language not found
 */
function extractLangContent(text: string, lang: string, defaultLang: string = 'en'): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let currentLang: string | null = null;
  let hasLangPrefixes = false;

  for (const line of lines) {
    // Check for language prefix at start of line (en:, fr:, es:, de:)
    const langMatch = line.match(/^(en|fr|es|de):\s*(.*)/);

    if (langMatch) {
      hasLangPrefixes = true;
      currentLang = langMatch[1];
      if (currentLang === lang) {
        result.push(langMatch[2]);
      }
    } else if (currentLang === lang) {
      // Continue collecting lines for current language until next lang prefix or empty line between sections
      if (line.trim() === '' && result.length > 0) {
        // Check if next non-empty line starts with a lang prefix
        const nextLineIdx = lines.indexOf(line) + 1;
        if (nextLineIdx < lines.length) {
          const nextLine = lines[nextLineIdx];
          if (nextLine.match(/^(en|fr|es|de):/)) {
            currentLang = null;
            continue;
          }
        }
      }
      result.push(line);
    } else if (!hasLangPrefixes || currentLang === null) {
      // No language prefixes seen yet, or we're in a neutral section
      // This handles content without any lang prefixes
    }
  }

  // If no content found for requested lang, try default lang
  if (result.length === 0 && lang !== defaultLang) {
    return extractLangContent(text, defaultLang, defaultLang);
  }

  // If still no content, return the whole text (no lang prefixes used)
  if (result.length === 0 && !hasLangPrefixes) {
    return text.trim();
  }

  return result.join('\n').trim();
}

/**
 * Extract title for a specific language
 * Format: # Title followed by # fr: Titre traduit
 */
function extractLangTitle(text: string, lang: string, defaultLang: string = 'en'): string {
  const lines = text.split('\n');

  // Find main title line (# Title)
  const titleLineIdx = lines.findIndex(l => l.match(/^#\s+[^#]/));
  if (titleLineIdx === -1) return '';

  const mainTitle = lines[titleLineIdx].replace(/^#\s+/, '').trim();

  // Check next line for translation (# fr: Titre)
  if (titleLineIdx + 1 < lines.length) {
    const nextLine = lines[titleLineIdx + 1];
    const langTitleMatch = nextLine.match(/^#\s+(en|fr|es|de):\s*(.+)$/);

    if (langTitleMatch && langTitleMatch[1] === lang) {
      return langTitleMatch[2].trim();
    }
  }

  // If requesting non-default lang but not found, check if main title has lang prefix
  if (lang !== defaultLang) {
    // Return main title as fallback
    return mainTitle;
  }

  return mainTitle;
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
 * Parse a single chunk with language support
 */
function parseChunk(content: string, lang: string, defaultLang: string): IntentChunk | null {
  const lines = content.split('\n');
  if (lines.length === 0) return null;

  // Parse header: ### @anchor | Title
  const headerMatch = lines[0].match(/^###\s+(@\w+:[^\s|]+)\s*\|\s*(.+)$/);
  if (!headerMatch) return null;

  const anchor = headerMatch[1];
  let title = headerMatch[2].trim();

  // Check next line for translated title (### fr: Titre traduit)
  if (lines.length > 1) {
    const langTitleMatch = lines[1].match(/^###\s+(en|fr|es|de):\s*(.+)$/);
    if (langTitleMatch && langTitleMatch[1] === lang) {
      title = langTitleMatch[2].trim();
    }
  }

  let storedHash: string | undefined;
  const descriptionLines: string[] = [];
  const decisions: string[] = [];
  const links: Array<{ target: string; reason: string }> = [];

  let currentDescLang: string | null = null;
  let hasLangPrefixes = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip translated title lines
    if (line.match(/^###\s+(en|fr|es|de):/)) {
      continue;
    }

    // Hash comment: <!-- hash: xxxx -->
    const hashMatch = line.match(/<!--\s*hash:\s*(\w+)\s*-->/);
    if (hashMatch) {
      storedHash = hashMatch[1];
      continue;
    }

    // Decision with lang: > Decision: ... or > fr: ...
    const decisionMatch = line.match(/^>\s*Decision:\s*(.+)$/);
    if (decisionMatch) {
      // Check if this is for our language (default is en)
      if (lang === defaultLang || lang === 'en') {
        decisions.push(decisionMatch[1]);
      }
      continue;
    }

    // Translated decision: > fr: ...
    const langDecisionMatch = line.match(/^>\s*(en|fr|es|de):\s*(.+)$/);
    if (langDecisionMatch) {
      if (langDecisionMatch[1] === lang) {
        decisions.push(langDecisionMatch[2]);
      }
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

    // Check for language prefix in description
    const langPrefixMatch = line.match(/^(en|fr|es|de):\s*(.*)/);
    if (langPrefixMatch) {
      hasLangPrefixes = true;
      currentDescLang = langPrefixMatch[1];
      if (currentDescLang === lang) {
        descriptionLines.push(langPrefixMatch[2]);
      }
      continue;
    }

    // Regular line - add if we're collecting for the right language
    if (line.trim() && !line.startsWith('#') && !line.startsWith('>') && !line.startsWith('@')) {
      if (!hasLangPrefixes) {
        // No lang prefixes, collect all
        descriptionLines.push(line);
      } else if (currentDescLang === lang) {
        descriptionLines.push(line);
      }
    } else if (line.trim() === '' && hasLangPrefixes) {
      // Empty line might signal end of current language section
      // Check if next non-empty line has a lang prefix
      let nextNonEmpty = i + 1;
      while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') {
        nextNonEmpty++;
      }
      if (nextNonEmpty < lines.length && lines[nextNonEmpty].match(/^(en|fr|es|de):/)) {
        currentDescLang = null;
      } else if (currentDescLang === lang) {
        descriptionLines.push(line);
      }
    }
  }

  return {
    anchor,
    title,
    storedHash,
    description: descriptionLines.join('\n').trim(),
    decisions,
    links,
  };
}

/**
 * Parse intent v2 file content with language support
 * @param content - Raw markdown content
 * @param lang - Language code (en, fr, es, de). Defaults to 'en'
 */
export function parseIntentV2(content: string, lang: string = 'en'): IntentV2 | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const { frontmatter, rest } = parsed;
  const defaultLang = 'en';

  // Parse title with language support
  const title = extractLangTitle(rest, lang, defaultLang);

  // Parse summary (## Summary section) with language support
  const summaryMatch = rest.match(/##\s+Summary\n([\s\S]*?)(?=\n##|\n---|\n###|$)/);
  const summaryRaw = summaryMatch ? summaryMatch[1] : '';
  const summary = extractLangContent(summaryRaw, lang, defaultLang);

  // Parse motivation (## Motivation section) with language support
  const motivationMatch = rest.match(/##\s+Motivation\n([\s\S]*?)(?=\n##|\n---|\n###|$)/);
  const motivationRaw = motivationMatch ? motivationMatch[1] : '';
  const motivation = motivationRaw ? extractLangContent(motivationRaw, lang, defaultLang) : undefined;

  // Parse chunks (### @anchor | Title sections) with language support
  const chunks: IntentChunk[] = [];
  // Updated pattern to capture chunks including translated titles
  const chunkPattern = /###\s+@\w+:[^\n]+[\s\S]*?(?=\n###\s+@|\n---\s*$|$)/g;
  const chunkMatches = rest.match(chunkPattern) || [];

  for (const chunkContent of chunkMatches) {
    const chunk = parseChunk(chunkContent, lang, defaultLang);
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return {
    frontmatter,
    title,
    summary,
    motivation: motivation || undefined,
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
