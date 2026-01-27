import { useMemo } from 'react';
import type { DiffHunk, DiffLine } from '../lib/parseDiff';
import type { FileData, IntentV2API, ViewMode } from '../types';
import { isRangeInDiff } from '../lib/diffUtils';
import { getFilePath, getFileName, pathsMatch } from '../lib/fileUtils';

interface UseVirtualHunksProps {
  files: FileData[];
  intents: IntentV2API[];
  allFileContents: Record<string, string>;
  viewMode: ViewMode;
}

interface UseVirtualHunksReturn {
  virtualHunksMap: Record<string, DiffHunk[]>;
  filesWithVirtualHunks: FileData[];
}

const CONTEXT_LINES = 10; // Lines of context before/after chunk

/**
 * Hook to create virtual hunks for context chunks (chunks not in diff but intent is shown)
 * and merge them into the files array
 */
export function useVirtualHunks({
  files,
  intents,
  allFileContents,
  viewMode,
}: UseVirtualHunksProps): UseVirtualHunksReturn {
  // Create virtual hunks for context chunks
  const virtualHunksMap = useMemo(() => {
    const virtualHunks: Record<string, DiffHunk[]> = {};

    if (viewMode === "browse") return virtualHunks;

    for (const intent of intents) {
      for (const chunk of intent.resolvedChunks) {
        if (!chunk.resolved || !chunk.resolvedFile) continue;

        // Check if this chunk is NOT in the diff (context chunk)
        const inDiff = isRangeInDiff(files, chunk.resolvedFile, chunk.resolved.startLine, chunk.resolved.endLine);
        if (inDiff) continue; // Skip chunks that are already in the diff

        // Get file content to create virtual hunk
        const fileContent = allFileContents[chunk.resolvedFile];
        if (!fileContent) continue;

        const fileLines = fileContent.split('\n');
        const { startLine, endLine } = chunk.resolved;

        // Calculate context range
        const contextStart = Math.max(1, startLine - CONTEXT_LINES);
        const contextEnd = Math.min(fileLines.length, endLine + CONTEXT_LINES);

        // Create virtual hunk lines
        const hunkLines: DiffLine[] = [];

        // Header line
        const hunkHeader = `@@ -${contextStart},${contextEnd - contextStart + 1} +${contextStart},${contextEnd - contextStart + 1} @@ (context for ${chunk.title || chunk.anchor})`;
        hunkLines.push({ type: "header", content: hunkHeader });

        // Add lines as context (no +/-)
        for (let i = contextStart; i <= contextEnd; i++) {
          const lineContent = fileLines[i - 1] || '';
          hunkLines.push({
            type: "context",
            content: lineContent,
            oldLineNumber: i,
            newLineNumber: i,
          });
        }

        // Create the virtual hunk
        const virtualHunk: DiffHunk = {
          header: hunkHeader,
          startLineOld: contextStart,
          startLineNew: contextStart,
          lines: hunkLines,
          isVirtual: true,
          chunkAnchor: chunk.anchor,
        };

        // Add to the map
        if (!virtualHunks[chunk.resolvedFile]) {
          virtualHunks[chunk.resolvedFile] = [];
        }
        virtualHunks[chunk.resolvedFile].push(virtualHunk);
      }
    }

    return virtualHunks;
  }, [intents, files, allFileContents, viewMode]);

  // Merge virtual hunks into files
  const filesWithVirtualHunks = useMemo((): FileData[] => {
    if (viewMode === "browse") return files;
    if (Object.keys(virtualHunksMap).length === 0) return files;

    const existingFilePaths = new Set(files.map(f => getFilePath(f)));

    // Create new array with merged hunks
    const result: FileData[] = files.map(file => {
      const fp = getFilePath(file);

      // Find matching virtual hunks for this file
      const matchingVirtualHunks = Object.entries(virtualHunksMap).find(([vhPath]) =>
        pathsMatch(vhPath, fp)
      );

      if (matchingVirtualHunks && file.diff) {
        const [, vhunks] = matchingVirtualHunks;
        const allHunks = [...file.diff.hunks, ...vhunks];
        allHunks.sort((a, b) => a.startLineNew - b.startLineNew);

        return {
          ...file,
          diff: {
            ...file.diff,
            hunks: allHunks,
          },
        };
      }
      return file;
    });

    // Add new files for virtual hunks that don't have existing files
    for (const [filePath, virtualHunks] of Object.entries(virtualHunksMap)) {
      const hasExistingFile = files.some(f => pathsMatch(getFilePath(f), filePath));

      if (!hasExistingFile && !existingFilePaths.has(filePath)) {
        const fileContent = allFileContents[filePath];
        result.push({
          diff: {
            oldPath: filePath,
            newPath: filePath,
            hunks: virtualHunks,
          },
          filename: getFileName(filePath),
          fullFileContent: fileContent,
        });
      }
    }

    return result;
  }, [files, virtualHunksMap, allFileContents, viewMode]);

  return {
    virtualHunksMap,
    filesWithVirtualHunks,
  };
}
