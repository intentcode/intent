import { readFileSync, existsSync } from "fs";
import * as path from "path";
import {
  parseIntentV2,
  parseManifest,
  type IntentV2,
  type Manifest,
} from "../../src/lib/parseIntentV2";
import { resolveAnchor, type AnchorResult } from "../../src/lib/anchorResolver";
import { getGitHubHeaders } from "../utils/github";
import { logger } from "../utils/logger";

// ============================================
// FILE CONTENT CACHE
// ============================================

/**
 * In-memory cache for GitHub file contents
 * Key: "owner/repo/ref/filepath"
 * Value: { content, expiresAt }
 * TTL: 5 minutes (files don't change often during a review session)
 */
const FILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  content: string;
  expiresAt: Date;
}

const fileCache = new Map<string, CacheEntry>();

// Cache stats for debugging
let cacheHits = 0;
let cacheMisses = 0;

function getCacheKey(owner: string, repo: string, ref: string, filePath: string): string {
  return `${owner}/${repo}/${ref}/${filePath}`;
}

function getCachedFile(key: string): string | null {
  const entry = fileCache.get(key);
  if (entry && entry.expiresAt > new Date()) {
    cacheHits++;
    return entry.content;
  }
  // Expired or not found
  if (entry) {
    fileCache.delete(key); // Clean up expired entry
  }
  cacheMisses++;
  return null;
}

function setCachedFile(key: string, content: string): void {
  fileCache.set(key, {
    content,
    expiresAt: new Date(Date.now() + FILE_CACHE_TTL_MS),
  });
}

/** Get cache stats for debugging */
export function getCacheStats(): { hits: number; misses: number; size: number } {
  return { hits: cacheHits, misses: cacheMisses, size: fileCache.size };
}

/** Clear the cache (useful for testing or manual refresh) */
export function clearFileCache(): void {
  fileCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  logger.info("intent-loader", "File cache cleared");
}

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
    logger.debug("intent-loader", `No manifest at ${manifestPath}`);
    return null;
  }

  const manifestContent = readFileSync(manifestPath, "utf-8");
  const manifest = parseManifest(manifestContent);
  if (manifest) {
    logger.debug("intent-loader", `Loaded local manifest with ${manifest.intents.length} intents`);
  }
  return manifest;
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

  logger.debug("intent-loader", `Loaded ${parsedIntents.length} local intents${lang ? ` (lang=${lang})` : ""}`);
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
      // Auth errors should be propagated, not silently ignored
      if (response.status === 401 || response.status === 403) {
        const errorBody = await response.text();
        logger.error("intent-loader", "Auth error loading manifest:", response.status, errorBody);
        throw new Error(`GitHub authentication failed (${response.status}). Please log in again.`);
      }
      // 404 means no manifest - that's OK
      if (response.status === 404) {
        logger.debug("intent-loader", "No manifest found (404)");
        return null;
      }
      // Other errors
      logger.warn("intent-loader", "Error loading manifest:", response.status);
      return null;
    }

    const manifestContent = await response.text();
    const manifest = parseManifest(manifestContent);
    if (manifest) {
      logger.debug("intent-loader", `Loaded GitHub manifest for ${owner}/${repo}@${ref} with ${manifest.intents.length} intents`);
    }
    return manifest;
  } catch (error) {
    // Re-throw auth errors
    if (error instanceof Error && error.message.includes("authentication")) {
      throw error;
    }
    logger.error("intent-loader", "Error loading GitHub manifest:", error);
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
  const activeEntries = manifest.intents.filter(e => e.status === "active");

  // Load all intents in parallel
  const intentPromises = activeEntries.map(async (intentEntry) => {
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
      return parseIntentV2(intentContent, lang || "en");
    }
    return null;
  });

  const results = await Promise.all(intentPromises);
  const parsedIntents = results.filter((intent): intent is IntentV2 => intent !== null);

  logger.debug("intent-loader", `Loaded ${parsedIntents.length} GitHub intents for ${owner}/${repo}@${ref}${lang ? ` (lang=${lang})` : ""}`);
  return parsedIntents;
}

/**
 * Load file content from GitHub (with caching)
 */
export async function loadGitHubFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  accessToken?: string
): Promise<string | null> {
  const cacheKey = getCacheKey(owner, repo, ref, filePath);

  // 1. Check cache first
  const cached = getCachedFile(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // 2. Cache miss - fetch from GitHub
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
    const response = await fetch(url, {
      headers: getGitHubHeaders("application/vnd.github.v3.raw", accessToken),
    });

    if (!response.ok) {
      return null;
    }

    const content = await response.text();

    // 3. Store in cache
    setCachedFile(cacheKey, content);

    return content;
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
  logger.debug("intent-loader", `Resolving anchors for ${intents.length} local intents`);
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
/**
 * Resolve anchors for intents using pre-fetched file contents (no network calls)
 */
export function resolveAnchorsWithContent(
  intents: IntentV2[],
  manifest: Manifest,
  fileContents: Record<string, string>,
  changedIntentFiles: string[] = []
): ResolvedIntent[] {
  logger.debug("intent-loader", `Resolving anchors for ${intents.length} intents using ${Object.keys(fileContents).length} cached files`);

  const resolvedIntents: ResolvedIntent[] = intents.map((intent, idx) => {
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
        const fileContent = fileContents[filePath];
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

  return resolvedIntents;
}

/**
 * Resolve anchors for intents by fetching files from GitHub (legacy, use resolveAnchorsWithContent when possible)
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
  logger.debug("intent-loader", `Fetching files for ${intents.length} GitHub intents (${owner}/${repo}@${ref})`);

  // Collect all unique files we need to fetch
  const allFiles = new Set<string>();
  for (const intent of intents) {
    for (const filePath of intent.frontmatter.files) {
      allFiles.add(filePath);
    }
  }

  // Fetch all files in parallel
  const fileContents: Record<string, string> = {};
  const filePromises = Array.from(allFiles).map(async (filePath) => {
    const content = await loadGitHubFileContent(owner, repo, filePath, ref, accessToken);
    if (content) {
      fileContents[filePath] = content;
    }
  });
  await Promise.all(filePromises);

  // Use the shared resolution logic
  return resolveAnchorsWithContent(intents, manifest, fileContents, changedIntentFiles);
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

  if (overlapsMap.size > 0) {
    logger.debug("intent-loader", `Detected ${overlapsMap.size} overlapping chunks`);
  }

  // Apply overlaps to chunks
  return intents.map((intent) => ({
    ...intent,
    resolvedChunks: intent.resolvedChunks.map((chunk) => ({
      ...chunk,
      overlaps: overlapsMap.get(chunk.anchor) || undefined,
    })),
  }));
}
