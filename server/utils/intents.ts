/**
 * Chunk with file information for overlap detection
 */
export interface ChunkWithFile {
  anchor: string;
  resolvedFile?: string | null;
  resolved: { startLine: number; endLine: number } | null;
}

/**
 * Detect overlapping chunks within the same file
 * Returns a map of anchor -> array of overlapping anchors
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

        // Check if ranges overlap
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

/**
 * Get language-aware intent file path
 * Returns the language-specific path if lang is provided, otherwise the base path
 */
export function getLanguageAwarePath(
  basePath: string,
  baseName: string,
  lang?: string
): { langPath: string | null; basePath: string } {
  if (lang) {
    const langPath = basePath.replace(
      `${baseName}.intent.md`,
      `${baseName}.intent.${lang}.md`
    );
    return { langPath, basePath };
  }
  return { langPath: null, basePath };
}
