import { readFileSync, existsSync } from "fs";
import * as path from "path";
import {
  parseIntentV2,
  parseManifest,
  type IntentV2,
  type Manifest,
} from "../../src/lib/parseIntentV2";
import { resolveAnchor, type AnchorResult } from "../../src/lib/anchorResolver";
import { getGitHubHeaders } from "./tokenManager";

// ============================================
// TYPES
// ============================================

export interface ChunkWithFile {
  anchor: string;
  resolvedFile?: string | null;
  resolved: { startLine: number; endLine: number } | null;
}

export interface ResolvedChunk {
  anchor: string;
  title: string;
  description: string;
  decisions: string[];
  links: Array<{ target: string; reason: string }>;
  storedHash?: string;
  resolved: AnchorResult | null;
  resolvedFile?: string | null;
  hashMatch: boolean | null;
  overlaps?: string[];
}

export interface ResolvedIntent extends IntentV2 {
  isNew: boolean;
  intentFilePath: string;
  resolvedChunks: ResolvedChunk[];
}

// ============================================
// OVERLAP DETECTION
// ============================================

/**
 * Detect overlapping chunks within the same file
 */
export function detectOverlaps(chunks: ChunkWithFile[]): Map<string, string[]> {
  const overlaps = new Map<string, string[]>();

  // Group chunks by file
  const chunksByFile = new Map<string, ChunkWithFile[]>();
  for (const chunk of chunks) {
    if (chunk.resolved && chunk.resolvedFile) {
      const existing = chunksByFile.get(chunk.resolvedFile) || [];
      existing.push(chunk);
      chunksByFile.set(chunk.resolvedFile, existing);
    }
  }

  // Check for overlaps within each file
  for (const [_file, fileChunks] of chunksByFile) {
    for (let i = 0; i < fileChunks.length; i++) {
      for (let j = i + 1; j < fileChunks.length; j++) {
        const a = fileChunks[i];
        const b = fileChunks[j];

        if (!a.resolved || !b.resolved) continue;

        const aStart = a.resolved.startLine;
        const aEnd = a.resolved.endLine;
        const bStart = b.resolved.startLine;
        const bEnd = b.resolved.endLine;

        // Overlap if: aStart <= bEnd AND bStart <= aEnd
        if (aStart <= bEnd && bStart <= aEnd) {
          // Add overlap for chunk a
          const aOverlaps = overlaps.get(a.anchor) || [];
          if (!aOverlaps.includes(b.anchor)) {
            aOverlaps.push(b.anchor);
          }
          overlaps.set(a.anchor, aOverlaps);

          // Add overlap for chunk b
          const bOverlaps = overlaps.get(b.anchor) || [];
          if (!bOverlaps.includes(a.anchor)) {
            bOverlaps.push(a.anchor);
          }
          overlaps.set(b.anchor, bOverlaps);
        }
      }
    }
  }

  return overlaps;
}

// ============================================
// LOCAL FILE LOADING
// ============================================

/**
 * Load manifest from local repository
 */
export function loadLocalManifest(repoPath: string): Manifest | null {
  const manifestPath = path.join(repoPath, ".intent", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifestContent = readFileSync(manifestPath, "utf-8");
  return parseManifest(manifestContent);
}

/**
 * Load intents from local repository with language fallback
 */
export function loadLocalIntents(
  repoPath: string,
  manifest: Manifest,
  lang?: string
): IntentV2[] {
  const parsedIntents: IntentV2[] = [];
  const intentsDir = path.join(repoPath, ".intent", "intents");

  for (const intentEntry of manifest.intents) {
    if (intentEntry.status !== "active") continue;

    // Try language-specific first, then fall back to base
    const baseName = intentEntry.file.replace(".intent.md", "");
    const langIntentPath = lang
      ? path.join(intentsDir, `${baseName}.intent.${lang}.md`)
      : null;
    const baseIntentPath = path.join(intentsDir, intentEntry.file);

    let intentContent: string | null = null;
    if (langIntentPath && existsSync(langIntentPath)) {
      intentContent = readFileSync(langIntentPath, "utf-8");
    } else if (existsSync(baseIntentPath)) {
      intentContent = readFileSync(baseIntentPath, "utf-8");
    }

    if (intentContent) {
      const parsed = parseIntentV2(intentContent, lang || "en");
      if (parsed) {
        parsedIntents.push(parsed);
      }
    }
  }

  return parsedIntents;
}

/**
 * Load file content from local repository
 */
export function loadLocalFileContent(repoPath: string, filePath: string): string | null {
  const fullPath = path.join(repoPath, filePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  return readFileSync(fullPath, "utf-8");
}

// ============================================
// GITHUB FILE LOADING
// ============================================

/**
 * Load manifest from GitHub repository
 */
export async function loadGitHubManifest(
  owner: string,
  repo: string,
  ref: string,
  accessToken?: string
): Promise<Manifest | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${ref}`;
    const response = await fetch(url, {
      headers: getGitHubHeaders("application/vnd.github.v3.raw", accessToken),
    });

    if (!response.ok) {
      return null;
    }

    const manifestContent = await response.text();
    return parseManifest(manifestContent);
  } catch (error) {
    console.error("[IntentLoader] Error loading GitHub manifest:", error);
    return null;
  }
}

/**
 * Load intents from GitHub repository with language fallback
 */
export async function loadGitHubIntents(
  owner: string,
  repo: string,
  ref: string,
  manifest: Manifest,
  lang?: string,
  accessToken?: string
): Promise<IntentV2[]> {
  const parsedIntents: IntentV2[] = [];

  for (const intentEntry of manifest.intents) {
    if (intentEntry.status !== "active") continue;

    const baseName = intentEntry.file.replace(".intent.md", "");

    // Try language-specific first
    let intentContent: string | null = null;

    if (lang) {
      const langPath = `.intent/intents/${baseName}.intent.${lang}.md`;
      intentContent = await loadGitHubFileContent(owner, repo, langPath, ref, accessToken);
    }

    // Fall back to base file
    if (!intentContent) {
      const basePath = `.intent/intents/${intentEntry.file}`;
      intentContent = await loadGitHubFileContent(owner, repo, basePath, ref, accessToken);
    }

    if (intentContent) {
      const parsed = parseIntentV2(intentContent, lang || "en");
      if (parsed) {
        parsedIntents.push(parsed);
      }
    }
  }

  return parsedIntents;
}

/**
 * Load file content from GitHub
 */
export async function loadGitHubFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  accessToken?: string
): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
    const response = await fetch(url, {
      headers: getGitHubHeaders("application/vnd.github.v3.raw", accessToken),
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error) {
    return null;
  }
}

// ============================================
// ANCHOR RESOLUTION
// ============================================

/**
 * Resolve anchors for intents using local file content
 */
export function resolveLocalAnchors(
  intents: IntentV2[],
  repoPath: string,
  manifest: Manifest,
  changedIntentFiles: string[] = []
): ResolvedIntent[] {
  return intents.map((intent, idx) => {
    const intentFileName = manifest.intents[idx]?.file || "";
    const intentFilePath = `.intent/intents/${intentFileName}`;
    const isNew = changedIntentFiles.some(
      (f) => f.includes(intentFileName) || f === intentFilePath
    );

    const resolvedChunks: ResolvedChunk[] = intent.chunks.map((chunk) => {
      let resolved: AnchorResult | null = null;
      let hashMatch: boolean | null = null;
      let resolvedFile: string | null = null;

      for (const filePath of intent.frontmatter.files) {
        const fileContent = loadLocalFileContent(repoPath, filePath);
        if (fileContent) {
          resolved = resolveAnchor(chunk.anchor, fileContent);
          if (resolved) {
            resolvedFile = filePath;
            if (chunk.storedHash) {
              hashMatch = resolved.hash === chunk.storedHash;
            }
            break;
          }
        }
      }

      return {
        anchor: chunk.anchor,
        title: chunk.title,
        description: chunk.description,
        decisions: chunk.decisions,
        links: chunk.links,
        storedHash: chunk.storedHash,
        resolved,
        resolvedFile,
        hashMatch,
      };
    });

    return {
      ...intent,
      isNew,
      intentFilePath,
      resolvedChunks,
    };
  });
}

/**
 * Resolve anchors for intents using GitHub file content
 */
export async function resolveGitHubAnchors(
  intents: IntentV2[],
  owner: string,
  repo: string,
  ref: string,
  manifest: Manifest,
  changedIntentFiles: string[] = [],
  accessToken?: string
): Promise<ResolvedIntent[]> {
  const resolvedIntents: ResolvedIntent[] = [];

  for (let idx = 0; idx < intents.length; idx++) {
    const intent = intents[idx];
    const intentFileName = manifest.intents[idx]?.file || "";
    const intentFilePath = `.intent/intents/${intentFileName}`;
    const isNew = changedIntentFiles.some(
      (f) => f.includes(intentFileName) || f === intentFilePath
    );

    const resolvedChunks: ResolvedChunk[] = [];

    for (const chunk of intent.chunks) {
      let resolved: AnchorResult | null = null;
      let hashMatch: boolean | null = null;
      let resolvedFile: string | null = null;

      for (const filePath of intent.frontmatter.files) {
        const fileContent = await loadGitHubFileContent(
          owner,
          repo,
          filePath,
          ref,
          accessToken
        );

        if (fileContent) {
          resolved = resolveAnchor(chunk.anchor, fileContent);
          if (resolved) {
            resolvedFile = filePath;
            if (chunk.storedHash) {
              hashMatch = resolved.hash === chunk.storedHash;
            }
            break;
          }
        }
      }

      resolvedChunks.push({
        anchor: chunk.anchor,
        title: chunk.title,
        description: chunk.description,
        decisions: chunk.decisions,
        links: chunk.links,
        storedHash: chunk.storedHash,
        resolved,
        resolvedFile,
        hashMatch,
      });
    }

    resolvedIntents.push({
      ...intent,
      isNew,
      intentFilePath,
      resolvedChunks,
    });
  }

  return resolvedIntents;
}

// ============================================
// OVERLAP APPLICATION
// ============================================

/**
 * Apply overlap detection to resolved intents
 */
export function applyOverlaps(intents: ResolvedIntent[]): ResolvedIntent[] {
  // Collect all chunks for overlap detection
  const allChunks: ChunkWithFile[] = [];
  for (const intent of intents) {
    for (const chunk of intent.resolvedChunks) {
      allChunks.push({
        anchor: chunk.anchor,
        resolvedFile: chunk.resolvedFile,
        resolved: chunk.resolved,
      });
    }
  }

  // Detect overlaps
  const overlapsMap = detectOverlaps(allChunks);

  // Apply overlaps to chunks
  return intents.map((intent) => ({
    ...intent,
    resolvedChunks: intent.resolvedChunks.map((chunk) => ({
      ...chunk,
      overlaps: overlapsMap.get(chunk.anchor) || undefined,
    })),
  }));
}
