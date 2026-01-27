import type { FileData } from '../types';
import { findFileByPath } from './fileUtils';

/**
 * Check if any line in a range is visible in the diff hunks
 * Used to determine if a chunk is in the current diff or needs a virtual hunk
 */
export function isRangeInDiff(
  files: FileData[],
  filePath: string,
  startLine: number,
  endLine: number
): boolean {
  const file = findFileByPath(files, filePath);
  if (!file || !file.diff?.hunks) return false;

  // Check if any line in the range is in any hunk
  for (const hunk of file.diff.hunks) {
    if (!hunk.lines || !Array.isArray(hunk.lines)) continue;
    for (const line of hunk.lines) {
      if (line.type !== 'remove' && line.newLineNumber !== undefined) {
        if (line.newLineNumber >= startLine && line.newLineNumber <= endLine) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Scroll to a chunk element and highlight it briefly
 */
export function scrollToChunk(targetFile: string, targetRange: string): void {
  const targetId = `chunk-${targetFile}-${targetRange}`;
  const element = document.getElementById(targetId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("chunk-highlight");
    setTimeout(() => element.classList.remove("chunk-highlight"), 2000);
  }
}
