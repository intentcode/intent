// Re-export from src for Vercel functions
export { parseIntentV2, parseManifest } from '../../src/lib/parseIntentV2.js';
export type { IntentV2, Manifest, IntentChunk } from '../../src/lib/parseIntentV2.js';
export { resolveAnchor } from '../../src/lib/anchorResolver.js';
export type { AnchorResult } from '../../src/lib/anchorResolver.js';

// Detect overlapping chunks within the same file
interface ChunkWithFile {
  anchor: string;
  resolvedFile?: string | null;
  resolved: { startLine: number; endLine: number } | null;
}

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
  for (const [, fileChunks] of chunksByFile) {
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

        if (aStart <= bEnd && bStart <= aEnd) {
          // Add to overlaps for both chunks
          const aOverlaps = overlaps.get(a.anchor) || [];
          if (!aOverlaps.includes(b.anchor)) aOverlaps.push(b.anchor);
          overlaps.set(a.anchor, aOverlaps);

          const bOverlaps = overlaps.get(b.anchor) || [];
          if (!bOverlaps.includes(a.anchor)) bOverlaps.push(a.anchor);
          overlaps.set(b.anchor, bOverlaps);
        }
      }
    }
  }

  return overlaps;
}
